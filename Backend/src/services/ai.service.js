const { GoogleGenAI } = require("@google/genai");
const { z } = require("zod");
const puppeteer = require("puppeteer");

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
});


// ============================================================
// QUESTION SCHEMAS
// ============================================================

const technicalQuestionSchema = z.object({
    question: z.string().describe(
        "Technical interview question"
    ),

    intention: z.string().describe(
        "What the interviewer is trying to evaluate"
    ),

    answer: z.string().describe(
        "Guidance on how the candidate should answer"
    ),
});


const behavioralQuestionSchema = z.object({
    question: z.string().describe(
        "Behavioral interview question"
    ),

    intention: z.string().describe(
        "What the interviewer is trying to evaluate"
    ),

    answer: z.string().describe(
        "Guidance on how the candidate should answer"
    ),
});


// ============================================================
// INTERVIEW REPORT SCHEMA
// ============================================================
//
// IMPORTANT:
// Do NOT use .min(8).max(10) here because this schema is also
// converted to JSON Schema and sent to Gemini.
//
// We validate the 8-10 requirement AFTER Gemini responds.
// ============================================================

const interviewReportSchema = z.object({

    matchScore: z.number().describe(
        "Overall percentage match between the candidate and the job description, from 0 to 100"
    ),

    technicalQuestions: z.array(
        technicalQuestionSchema
    ).describe(
        "Generate between 8 and 10 relevant technical interview questions"
    ),

    behavioralQuestions: z.array(
        behavioralQuestionSchema
    ).describe(
        "Generate between 8 and 10 relevant behavioral interview questions"
    ),

    skillGaps: z.array(
        z.object({
            skill: z.string().describe(
                "Skill that the candidate needs to improve"
            ),

            severity: z.enum([
                "low",
                "medium",
                "high"
            ]).describe(
                "Severity of the skill gap"
            ),
        })
    ).describe(
        "Important skill gaps between the candidate and the job requirements"
    ),

    preparationPlan: z.array(
        z.object({
            day: z.number().describe(
                "Preparation day number"
            ),

            focus: z.string().describe(
                "Main focus for this day"
            ),

            tasks: z.array(
                z.string()
            ).describe(
                "Tasks the candidate should complete"
            ),
        })
    ).describe(
        "Practical preparation plan for the interview"
    ),

    title: z.string().describe(
        "Title for the interview preparation report"
    ),
});


// ============================================================
// FINAL VALIDATION SCHEMA
// ============================================================
//
// This schema is used AFTER Gemini responds.
//
// This guarantees that your application does not accept
// a report containing only 3 or 4 questions.
// ============================================================

const interviewReportValidationSchema = z.object({

    matchScore: z.number(),

    technicalQuestions: z.array(
        technicalQuestionSchema
    ).min(8).max(10),

    behavioralQuestions: z.array(
        behavioralQuestionSchema
    ).min(8).max(10),

    skillGaps: z.array(
        z.object({
            skill: z.string(),
            severity: z.enum([
                "low",
                "medium",
                "high"
            ]),
        })
    ),

    preparationPlan: z.array(
        z.object({
            day: z.number(),
            focus: z.string(),
            tasks: z.array(z.string()),
        })
    ),

    title: z.string(),
});


// ============================================================
// GEMINI RETRY FUNCTION
// ============================================================
//
// This handles temporary Gemini errors such as:
//
// 503 -> Service unavailable / high demand
// 429 -> Rate limit
//
// It will retry up to 3 times.
// ============================================================

async function generateWithRetry(
    request,
    maxRetries = 3
) {

    for (let attempt = 1; attempt <= maxRetries; attempt++) {

        try {

            console.log(
                `Gemini request - Attempt ${attempt}/${maxRetries}`
            );

            const response = await ai.models.generateContent(
                request
            );

            console.log(
                "Gemini request successful"
            );

            return response;

        } catch (error) {

            console.error(
                `Gemini request failed - Attempt ${attempt}`
            );

            console.error(
                "Message:",
                error.message
            );

            console.error(
                "Status:",
                error.status
            );

            // Retry only temporary/rate-limit errors
            const shouldRetry =
                error.status === 503 ||
                error.status === 429;

            if (
                shouldRetry &&
                attempt < maxRetries
            ) {

                const delay = attempt * 3000;

                console.log(
                    `Retrying Gemini request in ${delay / 1000} seconds...`
                );

                await new Promise(
                    resolve => setTimeout(resolve, delay)
                );

                continue;
            }

            throw error;
        }
    }

    throw new Error(
        "Gemini request failed after maximum retries"
    );
}


// ============================================================
// GENERATE INTERVIEW REPORT
// ============================================================

async function generateInterviewReport({
    resume,
    selfDescription,
    jobDescription
}) {

    try {

        console.log(
            "Starting Gemini interview report generation..."
        );


        const prompt = `
You are an expert technical interviewer and career advisor.

Create a detailed interview preparation report for the candidate.

========================
CANDIDATE RESUME
========================

${resume || "Not provided"}


========================
SELF DESCRIPTION
========================

${selfDescription || "Not provided"}


========================
JOB DESCRIPTION
========================

${jobDescription || "Not provided"}


========================
IMPORTANT REQUIREMENTS
========================

1. Generate EXACTLY 8 to 10 technical interview questions.

2. Generate EXACTLY 8 to 10 behavioral interview questions.

3. NEVER generate fewer than 8 questions in either category.

4. Do not repeat questions or create questions that are substantially similar.

5. Technical questions must be based on:
   - Candidate's actual technical skills
   - Candidate's projects
   - Candidate's technologies
   - Candidate's resume
   - Requirements in the job description

6. Behavioral questions must be relevant to:
   - Candidate's background
   - Candidate's projects
   - Candidate's experience
   - Target job role

7. For EVERY technical and behavioral question provide:
   - question
   - intention
   - answer

8. The "answer" field should contain useful guidance explaining how the candidate should approach the answer.

9. Identify realistic skill gaps based on the resume and job description.

10. Create a practical preparation plan.

11. Calculate a realistic match score between 0 and 100.

12. Do not invent:
   - Work experience
   - Education
   - Skills
   - Projects
   - Certifications
   - Technologies

13. Use only information supported by the candidate information.

14. Make questions specific to the candidate instead of generic questions.

15. Make the report useful for an actual technical interview.

Return ONLY the structured JSON response matching the provided schema.
`;


        // ----------------------------------------------------
        // Try generating the report up to 3 times if the
        // returned question count is invalid.
        // ----------------------------------------------------

        const maxValidationAttempts = 3;

        for (
            let attempt = 1;
            attempt <= maxValidationAttempts;
            attempt++
        ) {

            console.log(
                `Interview report generation attempt ${attempt}/${maxValidationAttempts}`
            );


            const response = await generateWithRetry({

                model: "gemini-3.5-flash-lite",

                contents: prompt,

                config: {

                    responseMimeType:
                        "application/json",

                    responseSchema:
                        z.toJSONSchema(
                            interviewReportSchema
                        ),
                },
            });


            console.log(
                "Gemini interview response received"
            );


            if (
                !response ||
                !response.text
            ) {

                throw new Error(
                    "Gemini returned an empty interview report response"
                );
            }


            console.log(
                "Interview response length:",
                response.text.length
            );


            let parsedResponse;

            try {

                parsedResponse =
                    JSON.parse(response.text);

            } catch (jsonError) {

                console.error(
                    "Failed to parse Gemini JSON:"
                );

                console.error(
                    jsonError
                );

                console.error(
                    "Raw response:",
                    response.text
                );

                throw new Error(
                    "Gemini returned invalid JSON"
                );
            }


            // ------------------------------------------------
            // Validate response
            // ------------------------------------------------

            const validationResult =
                interviewReportValidationSchema.safeParse(
                    parsedResponse
                );


            if (
                validationResult.success
            ) {

                console.log(
                    "Interview report validation successful"
                );

                console.log(
                    "Technical questions:",
                    parsedResponse.technicalQuestions.length
                );

                console.log(
                    "Behavioral questions:",
                    parsedResponse.behavioralQuestions.length
                );

                return validationResult.data;
            }


            // ------------------------------------------------
            // Validation failed
            // ------------------------------------------------

            console.error(
                "Interview report validation failed:"
            );

            console.error(
                validationResult.error.issues
            );


            const technicalCount =
                Array.isArray(
                    parsedResponse.technicalQuestions
                )
                    ? parsedResponse.technicalQuestions.length
                    : 0;


            const behavioralCount =
                Array.isArray(
                    parsedResponse.behavioralQuestions
                )
                    ? parsedResponse.behavioralQuestions.length
                    : 0;


            console.error(
                `Technical questions generated: ${technicalCount}`
            );

            console.error(
                `Behavioral questions generated: ${behavioralCount}`
            );


            if (
                attempt === maxValidationAttempts
            ) {

                throw new Error(
                    `Gemini generated an invalid interview report. Technical questions: ${technicalCount}, Behavioral questions: ${behavioralCount}. Expected 8-10 in each category.`
                );
            }


            console.log(
                "Retrying because question count/response validation failed..."
            );
        }


        throw new Error(
            "Failed to generate a valid interview report"
        );

    } catch (error) {

        console.error(
            "========== GEMINI INTERVIEW REPORT ERROR =========="
        );

        console.error(
            "Message:",
            error.message
        );

        console.error(
            "Status:",
            error.status
        );

        console.error(
            "Stack:",
            error.stack
        );

        console.error(
            "===================================================="
        );

        throw error;
    }
}


// ============================================================
// GENERATE PDF FROM HTML
// ============================================================

async function generatePdfFromHtml(
    htmlContent
) {

    let browser;

    try {

        console.log(
            "Starting Puppeteer..."
        );


        browser = await puppeteer.launch({

            headless: true,

            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ],
        });


        console.log(
            "Puppeteer browser started"
        );


        const page =
            await browser.newPage();


        await page.setContent(
            htmlContent,
            {
                waitUntil: "domcontentloaded"
            }
        );


        console.log(
            "HTML loaded into browser"
        );


        const pdfBuffer =
            await page.pdf({

                format: "A4",

                printBackground: true,

                margin: {
                    top: "20mm",
                    bottom: "20mm",
                    left: "15mm",
                    right: "15mm"
                },
            });


        console.log(
            "PDF successfully generated"
        );


        return pdfBuffer;

    } catch (error) {

        console.error(
            "========== PUPPETEER PDF ERROR =========="
        );

        console.error(
            "Message:",
            error.message
        );

        console.error(
            "Stack:",
            error.stack
        );

        console.error(
            "========================================="
        );

        throw error;

    } finally {

        if (browser) {

            try {

                await browser.close();

                console.log(
                    "Puppeteer browser closed"
                );

            } catch (closeError) {

                console.error(
                    "Error closing Puppeteer:",
                    closeError.message
                );
            }
        }
    }
}


// ============================================================
// GENERATE AI RESUME PDF
// ============================================================

async function generateResumePdf({
    resume,
    selfDescription,
    jobDescription
}) {

    try {

        console.log(
            "Starting AI resume generation..."
        );


        // ----------------------------------------------------
        // Resume schema
        // ----------------------------------------------------

        const resumePdfSchema =
            z.object({

                html: z.string().describe(
                    "Complete HTML content of the professional resume"
                ),

            });


        // ----------------------------------------------------
        // Prompt
        // ----------------------------------------------------

        const prompt = `
You are an expert professional resume writer.

Create a professional, ATS-friendly resume using the candidate information below.

========================
ORIGINAL RESUME
========================

${resume || "Not provided"}


========================
SELF DESCRIPTION
========================

${selfDescription || "Not provided"}


========================
JOB DESCRIPTION
========================

${jobDescription || "Not provided"}


========================
RESUME REQUIREMENTS
========================

1. Create a professional ATS-friendly resume.

2. Tailor the resume to the job description.

3. Highlight the candidate's relevant:
   - Skills
   - Projects
   - Education
   - Experience
   - Technologies

4. Do NOT invent:
   - Work experience
   - Education
   - Projects
   - Skills
   - Certifications
   - Job titles
   - Companies
   - Technologies
   - Achievements

5. Only use information that exists in the supplied candidate information.

6. Improve wording and formatting where appropriate.

7. Keep the resume concise and professional.

8. The resume should preferably fit within 1-2 pages.

9. Create clean HTML that can be rendered directly by Puppeteer.

10. Include CSS inside the HTML itself.

11. Do not use external CSS files.

12. Do not use external JavaScript.

13. Do not use external images.

14. Use a clean professional layout.

15. Make the resume ATS-friendly:
   - Simple headings
   - Clear sections
   - Normal text
   - No unnecessary graphics
   - No complex tables
   - No excessive styling

16. The HTML must be complete and valid.

17. Return the HTML inside the "html" property of the provided JSON schema.

18. Do not return Markdown.

19. Do not return code fences.

20. Do not add explanations outside the JSON response.

Return ONLY the structured JSON response matching the provided schema.
`;


        console.log(
            "Sending resume request to Gemini..."
        );


        // ----------------------------------------------------
        // Generate resume using retry function
        // ----------------------------------------------------

        const response =
            await generateWithRetry({

                model: "gemini-3.5-flash-lite",

                contents: prompt,

                config: {

                    responseMimeType:
                        "application/json",

                    responseSchema:
                        z.toJSONSchema(
                            resumePdfSchema
                        ),
                },
            });


        console.log(
            "Gemini resume response received"
        );


        if (
            !response ||
            !response.text
        ) {

            throw new Error(
                "Gemini returned an empty resume response"
            );
        }


        console.log(
            "Resume response length:",
            response.text.length
        );


        // ----------------------------------------------------
        // Parse JSON
        // ----------------------------------------------------

        let jsonContent;

        try {

            jsonContent =
                JSON.parse(response.text);

        } catch (jsonError) {

            console.error(
                "Failed to parse Gemini resume JSON:"
            );

            console.error(
                jsonError
            );

            console.error(
                "Raw Gemini response:",
                response.text
            );

            throw new Error(
                "Gemini returned invalid JSON for resume"
            );
        }


        // ----------------------------------------------------
        // Validate generated HTML
        // ----------------------------------------------------

        const validatedResume =
            resumePdfSchema.safeParse(
                jsonContent
            );


        if (
            !validatedResume.success
        ) {

            console.error(
                "Resume response validation failed:"
            );

            console.error(
                validatedResume.error.issues
            );

            throw new Error(
                "Gemini returned an invalid resume structure"
            );
        }


        const htmlContent =
            validatedResume.data.html;


        if (
            !htmlContent ||
            typeof htmlContent !== "string" ||
            htmlContent.trim().length === 0
        ) {

            throw new Error(
                "Gemini generated empty resume HTML"
            );
        }


        console.log(
            "HTML generated successfully"
        );


        console.log(
            "HTML length:",
            htmlContent.length
        );


        // ----------------------------------------------------
        // Generate PDF
        // ----------------------------------------------------

        const pdfBuffer =
            await generatePdfFromHtml(
                htmlContent
            );


        if (
            !pdfBuffer ||
            pdfBuffer.length === 0
        ) {

            throw new Error(
                "Puppeteer generated an empty PDF"
            );
        }


        console.log(
            "PDF generated successfully."
        );

        console.log(
            "PDF size:",
            pdfBuffer.length,
            "bytes"
        );


        return pdfBuffer;

    } catch (error) {

        console.error(
            "========== RESUME PDF ERROR =========="
        );

        console.error(
            "Message:",
            error.message
        );

        console.error(
            "Status:",
            error.status
        );

        console.error(
            "Stack:",
            error.stack
        );

        console.error(
            "======================================="
        );

        throw error;
    }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    generateInterviewReport,
    generateResumePdf
};