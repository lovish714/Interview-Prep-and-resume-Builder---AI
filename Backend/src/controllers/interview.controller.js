 const pdfParse = require("pdf-parse")
 const {generateInterviewReport , generateResumePdf} = require("../services/ai.service")
 const interviewReportModel  = require("../models/interviewReport.model")
 

async function generateInterViewReportController(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Resume PDF is required"
            })
        }

        const resumeContent = await (
            new pdfParse.PDFParse(
                Uint8Array.from(req.file.buffer)
            )
        ).getText()

        const { selfDescription, jobDescription } = req.body

        console.log("Generating interview report...")
        console.log("Job description received:", !!jobDescription)
        console.log("Self description received:", !!selfDescription)
        console.log("Resume received:", !!resumeContent.text)

        const interViewReportByAI = await generateInterviewReport({
            resume: resumeContent.text,
            selfDescription,
            jobDescription
        })

        const interviewReport = await interviewReportModel.create({
            user: req.user.id,
            resume: resumeContent.text,
            selfDescription,
            jobDescription,
            ...interViewReportByAI
        })

        return res.status(201).json({
            message: "Interview report generated successfully",
            interviewReport
        })

    } catch (error) {
        console.error("GENERATE INTERVIEW REPORT ERROR:")
        console.error(error)

        return res.status(503).json({
            message: "AI service is temporarily unavailable",
            error: error.message
        })
    }
}



 async function getInterviewReportByIdController(req , res){

    const { interviewId } = req.params

    const interviewReport = await interviewReportModel.findOne({_id: interviewId, user: req.user.id})


    if(!interviewReport){
        return res.status(404).json({
            message: "Interview report not found"
        })
    }


    res.status(200).json({
        message: "Interview report fetched successfully",
        interviewReport
    })
 }

 

async function getAllInterviewReportsController(req, res) {
    const interviewReports = await interviewReportModel.find({ user: req.user.id }).sort({ createdAt: -1 }).select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan")

    res.status(200).json({
        message: "Interview reports fetched successfully.",
        interviewReports
    })
}





async function generateResumePdfController(req, res) {
    const { interviewReportId } = req.params

    const interviewReport = await interviewReportModel.findById(interviewReportId)

    if (!interviewReport) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    const { resume, jobDescription, selfDescription } = interviewReport

    const pdfBuffer = await generateResumePdf({ resume, jobDescription, selfDescription })

    res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=resume_${interviewReportId}.pdf`
    })

    res.send(pdfBuffer)
}


module.exports = {generateInterViewReportController , getInterviewReportByIdController , getAllInterviewReportsController , generateResumePdfController}