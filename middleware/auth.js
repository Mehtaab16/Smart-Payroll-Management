// middleware/auth.js
import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Missing or invalid Authorization header" });
    }

    const token = header.split(" ")[1];

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        const effectiveUserId = payload.userId || payload.id || payload._id;

        // imp + actorId
        //payload.impersonator.{userId,role,email}
        const isImpersonating =
            payload?.imp === true ||
            !!payload?.actorId ||
            !!payload?.impersonator?.userId;

        const actorId =
            payload.actorId ||
            payload?.impersonator?.userId ||
            (isImpersonating ? payload.originalUserId : null) ||
            effectiveUserId;

        const actorRole =
            payload.actorRole ||
            payload?.impersonator?.role ||
            payload.role;

        const actorEmail =
            payload.actorEmail ||
            payload?.impersonator?.email ||
            payload.email;

        req.user = {
            ...payload,
            userId: effectiveUserId, //effective user (impersonated user if imp token)
            impersonating: isImpersonating,

            actorId,
            actorRole,
            actorEmail,

            originalUserId: isImpersonating ? (payload.originalUserId || actorId) : null,
        };

        return next();
    } catch (e) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

 // requireRole(["admin","payroll_manager"])
export function requireRole(roleOrRoles) {
    const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];

    return (req, res, next) => {
        const r = req.user?.role;
        if (!r || !roles.includes(r)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
}

//allow multiple roles (PM routes should allow payroll_manager OR admin)
export function requireAnyRole(roles = []) {
    return (req, res, next) => {
        const r = req.user?.role;
        if (!r || !Array.isArray(roles) || roles.length === 0) {
            return res.status(403).json({ message: "Forbidden" });
        }
        if (!roles.includes(r)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
}
