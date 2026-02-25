// utils/auditActor.js
export function auditActor(req) {
    const imp = req.user?.impersonator;

    //If impersonating, the real actor is the admin (impersonator)
    if (imp?.userId) {
        return {
            actorId: imp.userId,
            actorRole: imp.role,
            actorEmail: imp.email,
            actingAsUserId: req.user.userId,
            actingAsRole: req.user.role,
            actingAsEmail: req.user.email,
            impersonating: true,
        };
    }

    return {
        actorId: req.user.userId,
        actorRole: req.user.role,
        actorEmail: req.user.email,
        impersonating: false,
    };
}
