const jwt = require("jsonwebtoken")
const tokenBlackListModel = require("../models/blacklist.models")


async function authUser(req , res , next){

    const token = req.cookies.token

    if(!token){
        return res.status(401).json({
            message: "Token not provided"
        })
    }
    

    const isTokenBlackListed = await tokenBlackListModel.findOne({ token })

    if(isTokenBlackListed){
        return res.status(401).json({
            message: "Token is invailed"
        })
    }

    try {
        const decoded = jwt.verify(token , process.env.JWT_SECRET)

        req.user = decoded

        next()
    } catch (error) {
        return res.status(401).json({
            message: "Invailed token"
        })
    }
}


module.exports = { authUser }