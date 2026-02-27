/**
 * Role-based authentication middleware
 * Supports: super_admin, admin, fan roles
 */

function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    
    // Check if request wants JSON (API) or HTML (web)
    const wantsJson = req.xhr || req.headers.accept?.includes('application/json');
    
    if (wantsJson) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Please login' });
    }
    
    // Redirect to login for web requests
    return res.redirect('/auth/login');
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        const wantsJson = req.xhr || req.headers.accept?.includes('application/json');
        if (wantsJson) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/auth/login');
    }
    
    const role = req.session.user.role;
    
    if (role === 'super_admin' || role === 'admin') {
        return next();
    }
    
    // Fan or other roles - forbidden
    const wantsJson = req.xhr || req.headers.accept?.includes('application/json');
    
    if (wantsJson) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }
    
    return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'You do not have permission to access this area.',
        error: {}
    });
}

function requireSuperAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login');
    }
    
    if (req.session.user.role === 'super_admin') {
        return next();
    }
    
    return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'Super admin access required.',
        error: {}
    });
}

function requireFanOrAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        // Check for landing unlock cookie as fallback
        if (req.cookies && req.cookies.landing_el_inmortal_unlock === '1') {
            // Allow access but mark as fan in request
            req.isFan = true;
            req.userRole = 'fan';
            return next();
        }
        
        const wantsJson = req.xhr || req.headers.accept?.includes('application/json');
        if (wantsJson) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/auth/login');
    }
    
    const role = req.session.user.role;
    
    if (['super_admin', 'admin', 'fan'].includes(role)) {
        req.userRole = role;
        req.isAdmin = (role === 'super_admin' || role === 'admin');
        req.isFan = (role === 'fan');
        return next();
    }
    
    return res.status(403).json({ error: 'Forbidden' });
}

// Middleware to inject user info into res.locals for views
function injectUser(req, res, next) {
    if (req.session && req.session.user) {
        res.locals.user = req.session.user;
        res.locals.isAdmin = ['super_admin', 'admin'].includes(req.session.user.role);
        res.locals.isSuperAdmin = req.session.user.role === 'super_admin';
        res.locals.isFan = req.session.user.role === 'fan';
    } else {
        res.locals.user = null;
        res.locals.isAdmin = false;
        res.locals.isSuperAdmin = false;
        res.locals.isFan = false;
    }
    next();
}

module.exports = {
    requireAuth,
    requireAdmin,
    requireSuperAdmin,
    requireFanOrAdmin,
    injectUser
};