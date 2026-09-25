import {
    getAllInterviewReports,
    generateInterviewReport,
    getInterviewReportById,
    generateResumePdf
} from "../services/interview.api"

import { useContext, useEffect } from "react"
import { InterviewContext } from "../interview.context"
import { useParams } from "react-router"


export const useInterview = () => {

    const context = useContext(InterviewContext)
    const { interviewId } = useParams()

    if (!context) {
        throw new Error(
            "useInterview must be used within an InterviewProvider"
        )
    }

    const {
        loading,
        setLoading,
        report,
        setReport,
        reports,
        setReports
    } = context


    // ─────────────────────────────────────────────
    // Generate Interview Report
    // ─────────────────────────────────────────────

    const generateReport = async ({
        jobDescription,
        selfDescription,
        resumeFile
    }) => {

        setLoading(true)

        try {

            console.log("Generating interview report...")

            const response = await generateInterviewReport({
                jobDescription,
                selfDescription,
                resumeFile
            })

            console.log("Generate report response:", response)

            if (!response || !response.interviewReport) {
                throw new Error(
                    "Interview report was not returned by the server"
                )
            }

            setReport(response.interviewReport)

            return response.interviewReport

        } catch (error) {

            console.error(
                "Generate report error:",
                error.response?.data ||
                error.message ||
                error
            )

            throw error

        } finally {

            setLoading(false)

        }
    }


    // ─────────────────────────────────────────────
    // Get Interview Report By ID
    // ─────────────────────────────────────────────

    const getReportById = async (interviewId) => {

        setLoading(true)

        try {

            console.log(
                "Getting interview report:",
                interviewId
            )

            const response =
                await getInterviewReportById(interviewId)

            console.log(
                "Interview report response:",
                response
            )

            if (!response || !response.interviewReport) {
                throw new Error(
                    "Interview report not found in API response"
                )
            }

            setReport(response.interviewReport)

            return response.interviewReport

        } catch (error) {

            console.error(
                "getReportById error:",
                error.response?.data ||
                error.message ||
                error
            )

            setReport(null)

            throw error

        } finally {

            setLoading(false)

        }
    }


    // ─────────────────────────────────────────────
    // Get All Interview Reports
    // ─────────────────────────────────────────────

    const getReports = async () => {

        setLoading(true)

        let response = null

        try {

            response = await getAllInterviewReports()

            setReports(
                response.interviewReports
            )

        } catch (error) {

            console.log(error)

        } finally {

            setLoading(false)

        }

        return response?.interviewReports || []

    }


    // ─────────────────────────────────────────────
    // Download Resume PDF
    // ─────────────────────────────────────────────

    const getResumePdf = async (interviewReportId) => {

        try {

            console.log(
                "Generating resume PDF:",
                interviewReportId
            )

            const response = await generateResumePdf({
                interviewReportId
            })

            const blob = new Blob(
                [response],
                {
                    type: "application/pdf"
                }
            )

            const url = window.URL.createObjectURL(blob)

            const link = document.createElement("a")

            link.href = url

            link.setAttribute(
                "download",
                `resume_${interviewReportId}.pdf`
            )

            document.body.appendChild(link)

            link.click()

            // Clean up
            link.remove()
            window.URL.revokeObjectURL(url)

            console.log(
                "Resume downloaded successfully"
            )

        } catch (error) {

            console.error(
                "Resume download error:",
                error.response?.data ||
                error.message ||
                error
            )

            throw error

        }
    }


    // ─────────────────────────────────────────────
    // Load Reports
    // ─────────────────────────────────────────────

    useEffect(() => {

        if (interviewId) {

            getReportById(interviewId)

        } else {

            getReports()

        }

    }, [interviewId])


    return {
        loading,
        report,
        reports,
        generateReport,
        getReportById,
        getReports,
        getResumePdf
    }
}