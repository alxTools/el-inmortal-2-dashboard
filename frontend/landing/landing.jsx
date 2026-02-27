import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ========================================
// AUDIO WAVES BACKGROUND COMPONENT
// ========================================
function AudioWavesBackground() {
    const bars = useMemo(() => {
        return Array.from({ length: 60 }, (_, i) => ({
            id: i,
            minHeight: 10 + Math.random() * 30,
            maxHeight: 60 + Math.random() * 140,
            duration: 0.8 + Math.random() * 1.2,
            delay: Math.random() * 2
        }));
    }, []);

    return (
        <div className="audio-waves-container">
            <div className="audio-waves">
                {bars.map((bar) => (
                    <div
                        key={bar.id}
                        className="audio-bar"
                        style={{
                            '--min-height': `${bar.minHeight}px`,
                            '--max-height': `${bar.maxHeight}px`,
                            '--duration': `${bar.duration}s`,
                            '--delay': `${bar.delay}s`
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

// ========================================
// FLOATING PARTICLES COMPONENT
// ========================================
function FloatingParticles() {
    const particles = useMemo(() => {
        return Array.from({ length: 20 }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            duration: 15 + Math.random() * 20,
            delay: Math.random() * 10,
            size: 2 + Math.random() * 4
        }));
    }, []);

    return (
        <div className="particles-container">
            {particles.map((p) => (
                <div
                    key={p.id}
                    className="particle"
                    style={{
                        left: `${p.left}%`,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        '--duration': `${p.duration}s`,
                        animationDelay: `${p.delay}s`
                    }}
                />
            ))}
        </div>
    );
}

// ========================================
// 3D TILT COVER COMPONENT
// ========================================
function Cover3D({ src, alt }) {
    const coverRef = useRef(null);

    const handleMouseMove = useCallback((e) => {
        const cover = coverRef.current;
        if (!cover) return;

        const rect = cover.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 10;
        const rotateY = (centerX - x) / 10;

        cover.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    }, []);

    const handleMouseLeave = useCallback(() => {
        const cover = coverRef.current;
        if (cover) {
            cover.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        }
    }, []);

    return (
        <div className="cover-3d-container">
            <div
                ref={coverRef}
                className="cover-3d"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <img src={src} alt={alt} />
            </div>
        </div>
    );
}

// ========================================
// TYPING TEXT COMPONENT
// ========================================
function TypingText({ text, className = '' }) {
    const [displayText, setDisplayText] = useState('');
    const [showCursor, setShowCursor] = useState(true);

    useEffect(() => {
        let index = 0;
        const timer = setInterval(() => {
            if (index < text.length) {
                setDisplayText(text.slice(0, index + 1));
                index++;
            } else {
                clearInterval(timer);
                // Keep cursor blinking after typing is done
            }
        }, 80);

        const cursorTimer = setInterval(() => {
            setShowCursor((prev) => !prev);
        }, 500);

        return () => {
            clearInterval(timer);
            clearInterval(cursorTimer);
        };
    }, [text]);

    return (
        <span className={className}>
            {displayText}
            <span style={{ opacity: showCursor ? 1 : 0, color: '#facc15' }}>|</span>
        </span>
    );
}

// ========================================
// SCROLL INDICATOR COMPONENT
// ========================================
function ScrollIndicator() {
    return (
        <div className="scroll-indicator">
            <span>Scroll</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
        </div>
    );
}

const DEFAULT_LANDING_DATA = {
    albumName: 'El Inmortal 2',
    artistName: 'Galante el Emperador',
    releaseDate: '2026-02-17T00:00:00.000Z',
    description:
        'Un regreso con 21 temas que mezclan reggaeton clasico, narrativa calle y colaboraciones estrategicas para dominar playlists y UGC.',
    coverImage: '/uploads/images/el_inmortal_2_cover_1771220102312.png',
    tracks: [],
    stats: {
        totalTracks: 21,
        collaborators: 0,
        featuredTracks: 0
    },
    streamingLinks: {
        spotify: '',
        appleMusic: '',
        youtube: ''
    }
};

function coerceLandingData(raw) {
    if (!raw || typeof raw !== 'object') return DEFAULT_LANDING_DATA;

    const tracks = Array.isArray(raw.tracks)
        ? raw.tracks.map((track) => ({
            id: track.id || null,
            trackNumber: Number(track.trackNumber || 0),
            title: String(track.title || '').trim(),
            producer: String(track.producer || '').trim(),
            features: String(track.features || '').trim(),
            duration: String(track.duration || '').trim(),
            audioUrl: String(track.audioUrl || '').trim()
        }))
        : [];

    return {
        ...DEFAULT_LANDING_DATA,
        ...raw,
        tracks,
        stats: {
            ...DEFAULT_LANDING_DATA.stats,
            ...(raw.stats || {})
        },
        streamingLinks: {
            ...DEFAULT_LANDING_DATA.streamingLinks,
            ...(raw.streamingLinks || {})
        }
    };
}

function formatLaunchDate(dateText) {
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return dateText;
    return new Intl.DateTimeFormat('es-PR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function getCountdown(releaseDateText) {
    const now = Date.now();
    const release = new Date(releaseDateText).getTime();
    const diff = Math.max(0, release - now);

    return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        launched: diff <= 0
    };
}

function formatTrackNumber(value) {
    return String(value || 0).padStart(2, '0');
}

// Modal de registro moderno
function SubscribeModal({ isOpen, onClose, onSubmit, isSubmitting, error, detectedCountry }) {
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [country, setCountry] = useState(detectedCountry || '');
    const [acceptEmails, setAcceptEmails] = useState(true);

    useEffect(() => {
        if (detectedCountry && !country) {
            setCountry(detectedCountry);
        }
    }, [detectedCountry]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ email, fullName, country });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>×</button>
                
                <div className="modal-header">
                    <div className="modal-icon">🎵</div>
                    <h2 className="modal-title">Desbloquea el Álbum Completo</h2>
                    <p className="modal-subtitle">
                        Sé el primero en escuchar "El Inmortal 2" antes que nadie
                    </p>
                </div>

                <div className="modal-benefits">
                    <div className="benefit-item">
                        <span className="benefit-icon">🎧</span>
                        <span>Escucha todas las 21 canciones</span>
                    </div>
                    <div className="benefit-item">
                        <span className="benefit-icon">📱</span>
                        <span>Acceso exclusivo al reproductor</span>
                    </div>
                    <div className="benefit-item">
                        <span className="benefit-icon">🎁</span>
                        <span>Contenido exclusivo y noticias</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label htmlFor="modal-name">Nombre completo *</label>
                        <input
                            id="modal-name"
                            type="text"
                            placeholder="Tu nombre"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="modal-email">Email *</label>
                        <input
                            id="modal-email"
                            type="email"
                            placeholder="tu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="modal-country">País *</label>
                        <input
                            id="modal-country"
                            type="text"
                            placeholder="Tu país"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            required
                        />
                        <small className="form-hint">Detectado automáticamente, puedes cambiarlo</small>
                    </div>

                    <div className="form-checkbox">
                        <input
                            type="checkbox"
                            id="accept-emails"
                            checked={acceptEmails}
                            onChange={(e) => setAcceptEmails(e.target.checked)}
                        />
                        <label htmlFor="accept-emails">
                            Acepto recibir emails con noticias, lanzamientos y contenido exclusivo de Galante el Emperador
                        </label>
                    </div>

                    {error && (
                        <div className="modal-error">
                            <span className="error-icon">⚠️</span>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="modal-submit-btn"
                        disabled={isSubmitting || !acceptEmails}
                    >
                        {isSubmitting ? (
                            <>
                                <span className="spinner"></span>
                                Procesando...
                            </>
                        ) : (
                            '🔓 Desbloquear Acceso Ahora'
                        )}
                    </button>
                </form>

                <p className="modal-footer">
                    🔒 Tu información está segura. Nunca compartimos tus datos.
                </p>
            </div>
        </div>
    );
}

// Modal del Carrito VIP (Mini-Disc)
function CartModal({ isOpen, onClose, cartItems, setCartItems, isCheckingOut, setIsCheckingOut }) {
    const [selectedPackage, setSelectedPackage] = useState(null);
    
    const packages = [
        {
            id: 'digital',
            name: 'Álbum Digital',
            description: 'Acceso completo al álbum El Inmortal 2 (21 tracks)',
            price: 0,
            icon: '🎵',
            included: true
        },
        {
            id: 'cd',
            name: 'Mini-Disc Firmado',
            description: 'Edición física limitada con firma de Galante. Incluye envío.',
            price: 15,
            icon: '💿',
            bonus: 'Incluye sticker exclusivo'
        },
        {
            id: 'cd-video',
            name: 'Mini-Disc + Video Saludo',
            description: 'Mini-Disc firmado + Video saludo personalizado de Galante (entrega 1 semana antes)',
            price: 25,
            icon: '🎁',
            bonus: 'Video saludo exclusivo + Sticker + Acceso VIP'
        }
    ];
    
    const addToCart = (pkg) => {
        if (pkg.id === 'digital') return; // Ya está incluido gratis
        
        const existing = cartItems.find(item => item.id === pkg.id);
        if (existing) {
            // Ya está en el carrito, no hacer nada o mostrar mensaje
            return;
        }
        
        setCartItems([...cartItems, pkg]);
        setSelectedPackage(pkg.id);
    };
    
    const removeFromCart = (pkgId) => {
        setCartItems(cartItems.filter(item => item.id !== pkgId));
        if (selectedPackage === pkgId) {
            setSelectedPackage(null);
        }
    };
    
    const getTotal = () => {
        return cartItems.reduce((sum, item) => sum + item.price, 0);
    };
    
    const handleCheckout = async () => {
        if (cartItems.length === 0) {
            onClose();
            return;
        }
        
        setIsCheckingOut(true);
        
        // Verificar si hay un usuario registrado (debería estar guardado en localStorage o cookie)
        // Por ahora, redirigimos a la página de checkout con un mensaje
        
        // Guardar el carrito en localStorage para el checkout
        localStorage.setItem('ei2_cart', JSON.stringify(cartItems));
        
        // Mostrar modal de información
        setTimeout(() => {
            setIsCheckingOut(false);
            
            // Verificar si el usuario ya está registrado
            const hasRegistered = localStorage.getItem('ei2_registered');
            
            if (hasRegistered) {
                // Si ya está registrado, redirigir al checkout
                const userEmail = localStorage.getItem('ei2_email');
                if (userEmail) {
                    window.location.href = `/landing/checkout?email=${encodeURIComponent(userEmail)}&token=demo`;
                } else {
                    alert('Por favor regístrate primero para completar tu compra');
                }
            } else {
                // Si no está registrado, cerrar modal y mostrar el de registro
                onClose();
                // Abrir el modal de suscripción
                setTimeout(() => {
                    if (window.openSubscribeModal) {
                        window.openSubscribeModal();
                    } else {
                        alert('Por favor regístrate primero para acceder al checkout seguro');
                    }
                }, 100);
            }
        }, 500);
    };
    
    if (!isOpen) return null;

    const cartStyles = {
        overlay: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
        },
        modal: {
            background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
            borderRadius: '24px',
            border: '1px solid rgba(250,204,21,0.3)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 40px rgba(250,204,21,0.1)',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            position: 'relative'
        },
        header: {
            padding: '32px 24px 20px',
            textAlign: 'center',
            borderBottom: '1px solid rgba(250,204,21,0.2)'
        },
        icon: {
            fontSize: '48px',
            marginBottom: '12px'
        },
        title: {
            fontSize: '28px',
            fontWeight: 800,
            color: '#facc15',
            marginBottom: '8px',
            letterSpacing: '0.05em'
        },
        subtitle: {
            color: '#94a3b8',
            fontSize: '14px'
        },
        packages: {
            padding: '24px'
        },
        packageCard: {
            background: 'rgba(30,41,59,0.6)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            border: '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '16px',
            position: 'relative',
            overflow: 'hidden'
        },
        packageCardSelected: {
            borderColor: '#facc15',
            background: 'rgba(250,204,21,0.1)',
            boxShadow: '0 0 20px rgba(250,204,21,0.2)'
        },
        packageCardIncluded: {
            opacity: 0.8,
            cursor: 'default'
        },
        packageIcon: {
            fontSize: '36px',
            flexShrink: 0
        },
        packageInfo: {
            flex: 1
        },
        packageName: {
            fontSize: '18px',
            fontWeight: 700,
            color: '#f1f5f9',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        badgeFree: {
            background: '#22c55e',
            color: 'white',
            fontSize: '10px',
            padding: '2px 8px',
            borderRadius: '999px',
            fontWeight: 700
        },
        packageDesc: {
            color: '#94a3b8',
            fontSize: '13px',
            lineHeight: 1.5,
            marginBottom: '6px'
        },
        packageBonus: {
            color: '#facc15',
            fontSize: '12px',
            fontWeight: 600
        },
        packagePrice: {
            textAlign: 'right',
            minWidth: '80px'
        },
        priceFree: {
            color: '#22c55e',
            fontWeight: 700,
            fontSize: '20px'
        },
        priceAmount: {
            color: '#facc15',
            fontWeight: 800,
            fontSize: '24px'
        },
        btnAdd: {
            background: 'linear-gradient(135deg, #facc15, #fbbf24)',
            color: '#0f172a',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            marginTop: '8px',
            transition: 'transform 0.2s'
        },
        btnRemove: {
            background: '#ef4444',
            color: 'white',
            border: 'none',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            fontWeight: 700,
            cursor: 'pointer',
            marginTop: '8px'
        },
        summary: {
            padding: '24px',
            borderTop: '1px solid rgba(250,204,21,0.2)',
            background: 'rgba(0,0,0,0.2)'
        },
        total: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            fontSize: '20px'
        },
        totalAmount: {
            color: '#facc15',
            fontWeight: 800,
            fontSize: '32px'
        },
        checkoutBtn: {
            width: '100%',
            background: 'linear-gradient(135deg, #facc15, #fbbf24)',
            color: '#0f172a',
            border: 'none',
            padding: '16px 24px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 10px 25px rgba(250,204,21,0.3)',
            transition: 'transform 0.2s'
        },
        footer: {
            padding: '16px 24px',
            textAlign: 'center',
            color: '#64748b',
            fontSize: '12px',
            borderTop: '1px solid rgba(255,255,255,0.1)'
        },
        closeBtn: {
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: '#94a3b8',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            fontSize: '24px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
        },
        popularBadge: {
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'linear-gradient(135deg, #facc15, #fbbf24)',
            color: '#0f172a',
            fontSize: '10px',
            fontWeight: 800,
            padding: '4px 12px',
            borderRadius: '999px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
        }
    };

    return (
        <div style={cartStyles.overlay} onClick={onClose}>
            <div style={cartStyles.modal} onClick={(e) => e.stopPropagation()}>
                <button style={cartStyles.closeBtn} onClick={onClose}>×</button>
                
                <div style={cartStyles.header}>
                    <div style={cartStyles.icon}>🛒</div>
                    <h2 style={cartStyles.title}>Carrito VIP</h2>
                    <p style={cartStyles.subtitle}>
                        🎵 Álbum Digital: <strong style={{color: '#22c55e'}}>GRATIS</strong> (ya incluido)
                    </p>
                </div>
                
                <div style={cartStyles.packages}>
                    {packages.map(pkg => (
                        <div 
                            key={pkg.id} 
                            style={{
                                ...cartStyles.packageCard,
                                ...(pkg.included ? cartStyles.packageCardIncluded : {}),
                                ...(cartItems.find(item => item.id === pkg.id) || selectedPackage === pkg.id ? cartStyles.packageCardSelected : {})
                            }}
                            onClick={() => !pkg.included && addToCart(pkg)}
                        >
                            {pkg.id === 'cd-video' && <span style={cartStyles.popularBadge}>Más Popular</span>}
                            <div style={cartStyles.packageIcon}>{pkg.icon}</div>
                            <div style={cartStyles.packageInfo}>
                                <h3 style={cartStyles.packageName}>
                                    {pkg.name}
                                    {pkg.included && <span style={cartStyles.badgeFree}>GRATIS</span>}
                                </h3>
                                <p style={cartStyles.packageDesc}>{pkg.description}</p>
                                {pkg.bonus && <p style={cartStyles.packageBonus}>✨ {pkg.bonus}</p>}
                            </div>
                            <div style={cartStyles.packagePrice}>
                                {pkg.price === 0 ? (
                                    <span style={cartStyles.priceFree}>$0</span>
                                ) : (
                                    <>
                                        <span style={cartStyles.priceAmount}>${pkg.price}</span>
                                        {cartItems.find(item => item.id === pkg.id) ? (
                                            <button 
                                                style={cartStyles.btnRemove}
                                                onClick={(e) => { e.stopPropagation(); removeFromCart(pkg.id); }}
                                                onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                                                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                                            >
                                                ✕
                                            </button>
                                        ) : (
                                            <button 
                                                style={cartStyles.btnAdd}
                                                onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                                                onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                                            >
                                                Agregar
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                
                {cartItems.length > 0 && (
                    <div style={cartStyles.summary}>
                        <div style={cartStyles.total}>
                            <span style={{color: '#94a3b8'}}>Total:</span>
                            <span style={cartStyles.totalAmount}>${getTotal()}</span>
                        </div>
                        <button 
                            style={{
                                ...cartStyles.checkoutBtn,
                                opacity: isCheckingOut ? 0.7 : 1,
                                cursor: isCheckingOut ? 'not-allowed' : 'pointer'
                            }}
                            onClick={handleCheckout}
                            disabled={isCheckingOut}
                            onMouseEnter={(e) => !isCheckingOut && (e.target.style.transform = 'translateY(-2px)')}
                            onMouseLeave={(e) => !isCheckingOut && (e.target.style.transform = 'translateY(0)')}
                        >
                            {isCheckingOut ? (
                                <>
                                    <span style={{
                                        width: '20px',
                                        height: '20px',
                                        border: '3px solid rgba(15,23,42,0.3)',
                                        borderTopColor: '#0f172a',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite'
                                    }}></span>
                                    Procesando...
                                </>
                            ) : (
                                '💳 Ir a Checkout Seguro'
                            )}
                        </button>
                    </div>
                )}
                
                <p style={cartStyles.footer}>
                    🔒 Pago seguro procesado por Stripe. Entrega en 7-14 días.
                </p>
            </div>
        </div>
    );
}

function LandingApp({ data }) {
    const [countdown, setCountdown] = useState(() => getCountdown(data.releaseDate));
    const [filter, setFilter] = useState('all');
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [detectedCountry, setDetectedCountry] = useState('');
    const [fanStats, setFanStats] = useState({ totalLeads: 0, topCountries: [] });
    const [topTracks, setTopTracks] = useState([]);
    const [comments, setComments] = useState([]);
    const [visibleComments, setVisibleComments] = useState([]);
    const [commentRotationIndex, setCommentRotationIndex] = useState(0);
    const [newComment, setNewComment] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [commentError, setCommentError] = useState('');
    const [lastCommentTime, setLastCommentTime] = useState(null);
    const [currentUserEmail, setCurrentUserEmail] = useState('');
    
    // Fan Generator states
    const [showFanGenerator, setShowFanGenerator] = useState(false);
    const [loops, setLoops] = useState([]);
    const [selectedLoop, setSelectedLoop] = useState(null);
    const [userPhoto, setUserPhoto] = useState(null);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [generatedVideo, setGeneratedVideo] = useState(null);
    
    const [currentTrack, setCurrentTrack] = useState(null);
    const currentTrackRef = useRef(currentTrack);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [playError, setPlayError] = useState('');
    const [audioReady, setAudioReady] = useState(false);
    const audioRef = useRef(null);
    
    // Keep ref in sync with state for audio event handlers
    useEffect(() => {
        currentTrackRef.current = currentTrack;
    }, [currentTrack]);
    
    // Sistema de desbloqueo progresivo
    const [unlockedTracks, setUnlockedTracks] = useState([]); // Tracks que ya escuchó completamente
    const [currentUnlockIndex, setCurrentUnlockIndex] = useState(0); // Índice del track actual que puede escuchar
    const [hasStartedListening, setHasStartedListening] = useState(false); // Si ya presionó "Escuchar Álbum"
    
    // Modal de reacción
    const [showReactionModal, setShowReactionModal] = useState(false);
    const [reactionTrack, setReactionTrack] = useState(null);
    const [reactionText, setReactionText] = useState('');
    const [isSubmittingReaction, setIsSubmittingReaction] = useState(false);
    
    // Recompensas
    const [showRewardModal, setShowRewardModal] = useState(false);
    const [currentReward, setCurrentReward] = useState(null);
    const [collectedRewards, setCollectedRewards] = useState([]);
    
    // Nuevos modales para gamificación
    const [showStartModal, setShowStartModal] = useState(false);
    const [showCompletionModal, setShowCompletionModal] = useState(false);
    const [nextUnlockableTrack, setNextUnlockableTrack] = useState(1);

    // Modal de info de track
    const [showTrackInfoModal, setShowTrackInfoModal] = useState(false);
    const [selectedTrackForInfo, setSelectedTrackForInfo] = useState(null);

    // Carrito VIP (Mini-Disc)
    const [showCartModal, setShowCartModal] = useState(false);
    const [cartItems, setCartItems] = useState([]);
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    // Detectar país por IP
    useEffect(() => {
        const detectCountry = async () => {
            try {
                // Intentar obtener país del navegador primero
                const userLang = navigator.language || navigator.userLanguage;
                const langCountry = userLang.split('-')[1];
                
                if (langCountry) {
                    setDetectedCountry(langCountry);
                    return;
                }

                // Fallback a API de geolocalización
                const response = await fetch('https://ipapi.co/json/', { 
                    signal: AbortSignal.timeout(5000) 
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.country_name) {
                        setDetectedCountry(data.country_name);
                    }
                }
            } catch (error) {
                console.log('No se pudo detectar país:', error);
            }
        };

        detectCountry();
    }, []);

    // Deshabilitar clic derecho y atajos de teclado para proteger el contenido
    useEffect(() => {
        const disableContextMenu = (e) => {
            e.preventDefault();
            return false;
        };
        
        const disableKeyboardShortcuts = (e) => {
            // Deshabilitar F12 (DevTools)
            if (e.key === 'F12') {
                e.preventDefault();
                return false;
            }
            // Deshabilitar Ctrl+Shift+I (DevTools)
            if (e.ctrlKey && e.shiftKey && e.key === 'I') {
                e.preventDefault();
                return false;
            }
            // Deshabilitar Ctrl+S (Guardar)
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                return false;
            }
            // Deshabilitar Ctrl+U (Ver código fuente)
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                return false;
            }
        };

        document.addEventListener('contextmenu', disableContextMenu);
        document.addEventListener('keydown', disableKeyboardShortcuts);
        
        return () => {
            document.removeEventListener('contextmenu', disableContextMenu);
            document.removeEventListener('keydown', disableKeyboardShortcuts);
        };
    }, []);

    // Verificar si está desbloqueado
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Check for unlock (old flow) or verified (magic link flow)
        const shouldUnlock = urlParams.get('unlock') === '1' || urlParams.get('verified') === '1';
        
        if (shouldUnlock) {
            setIsUnlocked(true);
            localStorage.setItem('landing_el_inmortal_unlock', '1');
            // Leer email de la cookie
            const emailCookie = document.cookie.split('; ').find(row => row.startsWith('landing_email='));
            if (emailCookie) {
                setCurrentUserEmail(decodeURIComponent(emailCookie.split('=')[1]));
            }
            // Limpiar URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            // Check localStorage as fallback (for returning users)
            const storedUnlock = localStorage.getItem('landing_el_inmortal_unlock');
            if (storedUnlock === '1') {
                setIsUnlocked(true);
                // Leer email de la cookie
                const emailCookie = document.cookie.split('; ').find(row => row.startsWith('landing_email='));
                if (emailCookie) {
                    setCurrentUserEmail(decodeURIComponent(emailCookie.split('=')[1]));
                }
            } else {
                // Mostrar modal después de 2 segundos
                const timer = setTimeout(() => {
                    setIsModalOpen(true);
                }, 2000);
                return () => clearTimeout(timer);
            }
        }
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(getCountdown(data.releaseDate));
        }, 1000 * 30);

        return () => clearInterval(timer);
    }, [data.releaseDate]);

    // Exponer función global para abrir modal desde el carrito
    useEffect(() => {
        window.openSubscribeModal = () => {
            setIsModalOpen(true);
        };

        return () => {
            delete window.openSubscribeModal;
        };
    }, []);

    useEffect(() => {
        if (!isUnlocked) return;
        
        const fetchStats = async () => {
            try {
                const response = await fetch('/landing/stats');
                if (!response.ok) return;
                const payload = await response.json();
                setFanStats({
                    totalLeads: payload.totalLeads || 0,
                    topCountries: Array.isArray(payload.topCountries) ? payload.topCountries : []
                });
            } catch (error) {
                console.error('Stats fetch error', error);
            }
        };
        
        const fetchTopTracks = async () => {
            try {
                const response = await fetch('/landing/top-tracks');
                if (!response.ok) return;
                const payload = await response.json();
                if (payload.success && Array.isArray(payload.tracks)) {
                    setTopTracks(payload.tracks);
                }
            } catch (error) {
                console.error('Top tracks fetch error', error);
            }
        };

        const fetchComments = async () => {
            try {
                const response = await fetch('/landing/comments');
                if (!response.ok) return;
                const payload = await response.json();
                if (payload.success && Array.isArray(payload.comments)) {
                    setComments(payload.comments);
                }
            } catch (error) {
                console.error('Comments fetch error', error);
            }
        };

        fetchStats();
        fetchTopTracks();
        fetchComments();
        
        // Fetch available loops for fan generator
        const fetchLoops = async () => {
            try {
                const response = await fetch('/fan-generator/loops');
                if (!response.ok) return;
                const payload = await response.json();
                if (payload.success && Array.isArray(payload.loops)) {
                    setLoops(payload.loops);
                }
            } catch (error) {
                console.error('Loops fetch error', error);
            }
        };
        fetchLoops();
    }, [isUnlocked]);

    // Rotate comments every 5 seconds
    useEffect(() => {
        if (!isUnlocked || comments.length === 0) return;

        const interval = setInterval(() => {
            setCommentRotationIndex(prev => (prev + 1) % Math.max(1, comments.length - 4));
        }, 5000);

        return () => clearInterval(interval);
    }, [isUnlocked, comments.length]);

    // Update visible comments when comments or rotation changes
    useEffect(() => {
        if (comments.length === 0) return;

        // Show 4 comments starting from rotation index
        const start = commentRotationIndex;
        const visible = [];
        for (let i = 0; i < 4; i++) {
            const index = (start + i) % comments.length;
            visible.push(comments[index]);
        }
        setVisibleComments(visible);
    }, [comments, commentRotationIndex]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return undefined;

        const handleEnded = () => {
            console.log('[Audio] Track ended!');
            setIsPlaying(false);
            
            const track = currentTrackRef.current;
            if (!track || !data.tracks || data.tracks.length === 0) return;
            
            console.log('[Audio] Track', track.trackNumber, 'finished');
            
            // Marcar este track como desbloqueado/completado
            if (!unlockedTracks.includes(track.trackNumber)) {
                setUnlockedTracks(prev => [...prev, track.trackNumber]);
            }
            
            // Calcular el siguiente número de track
            const nextTrackNumber = track.trackNumber + 1;
            const hasMoreTracks = data.tracks.some(t => t.trackNumber === nextTrackNumber);
            
            // Verificar si es el último track
            const isLastTrack = !hasMoreTracks;
            
            if (isLastTrack) {
                // Álbum completado - mostrar modal de felicitación
                console.log('[Audio] Album completed!');
                setShowCompletionModal(true);
            } else {
                // Mostrar modal de reacción
                setReactionTrack(track);
                setShowReactionModal(true);
                
                // Desbloquear el siguiente track inmediatamente
                setCurrentUnlockIndex(prev => Math.max(prev, nextTrackNumber - 1));
                console.log('[Audio] Unlocked track', nextTrackNumber);
            }
        };
        const handlePause = () => {
            setIsPlaying(false);
            setIsLoading(false);
        };
        const handlePlay = () => {
            setIsPlaying(true);
            setIsLoading(false);
            setAudioReady(true);
        };
        const handleCanPlay = () => {
            setAudioReady(true);
            setIsLoading(false);
        };
        const handleLoadStart = () => {
            setIsLoading(true);
        };
        const handleWaiting = () => {
            setIsLoading(true);
        };
        const handleError = (e) => {
            console.error('[Audio Error]', e);
            setPlayError('Error al cargar el audio. Verifica tu conexión.');
            setIsPlaying(false);
            setIsLoading(false);
            setAudioReady(false);
        };

        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('loadstart', handleLoadStart);
        audio.addEventListener('waiting', handleWaiting);
        audio.addEventListener('error', handleError);

        return () => {
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('loadstart', handleLoadStart);
            audio.removeEventListener('waiting', handleWaiting);
            audio.removeEventListener('error', handleError);
        };
    }, []);

    const releaseDateLabel = useMemo(() => formatLaunchDate(data.releaseDate), [data.releaseDate]);

    const filteredTracks = useMemo(() => {
        if (filter === 'featured') {
            return data.tracks.filter((track) => track.features);
        }

        if (filter === 'core') {
            return data.tracks.filter((track) => !track.features);
        }

        return data.tracks;
    }, [filter, data.tracks]);

    const cards = [
        {
            label: 'Tracks',
            value: data.stats.totalTracks || data.tracks.length || 21,
            detail: 'disenados para playlist y campaña'
        },
        {
            label: 'Colaboradores',
            value: data.stats.collaborators || 0,
            detail: 'productores, feats y creative crew'
        },
        {
            label: 'Con feats',
            value: data.stats.featuredTracks || data.tracks.filter((track) => track.features).length,
            detail: 'momentos clave para contenido viral'
        }
    ];

    // Verificar si el email está verificado (tiene session o fan verificado)
    const isEmailVerified = () => {
        return isUnlocked && (document.cookie.includes('landing_el_inmortal_unlock=1') || localStorage.getItem('landing_el_inmortal_unlock') === '1');
    };

    const handlePlayToggle = async (track) => {
        if (!isUnlocked) {
            setIsModalOpen(true);
            return;
        }
        
        if (!isEmailVerified()) {
            setPlayError('Verifica tu email para escuchar. Revisa tu correo por el magic link.');
            setTimeout(() => setPlayError(''), 5000);
            return;
        }
        
        // Verificar si ya inició con "Escuchar Álbum"
        if (!hasStartedListening) {
            setPlayError('Presiona "Escuchar Álbum" para comenzar la experiencia.');
            setTimeout(() => setPlayError(''), 3000);
            return;
        }
        
        // Verificar si el track está desbloqueado
        const trackIndex = data.tracks.findIndex(t => t.trackNumber === track.trackNumber);
        if (trackIndex > currentUnlockIndex) {
            setPlayError(`Escucha los tracks anteriores para desbloquear este. Siguiente: Track ${currentUnlockIndex + 1}`);
            setTimeout(() => setPlayError(''), 3000);
            return;
        }
        
        if (!track.audioUrl) {
            setPlayError('Audio no disponible para este track.');
            return;
        }
        
        const audio = audioRef.current;
        if (!audio) {
            setPlayError('Error del reproductor. Recarga la página.');
            return;
        }

        const isSame = currentTrack && currentTrack.trackNumber === track.trackNumber;
        setPlayError('');

        // Emitir evento para notificaciones
        if (isSame && isPlaying) {
            document.dispatchEvent(new CustomEvent('audio-paused'));
        } else {
            document.dispatchEvent(new CustomEvent('audio-playing'));
        }

        if (isSame) {
            if (isPlaying) {
                audio.pause();
                return;
            }
            if (!audioReady && audio.paused) {
                setIsLoading(true);
            }
            try {
                await audio.play();
            } catch (error) {
                console.error('[Audio Play Error]', error);
                setIsLoading(false);
                if (error.name === 'NotAllowedError') {
                    setPlayError('Haz clic nuevamente para reproducir el audio.');
                } else {
                    setPlayError('No se pudo reproducir el audio.');
                }
            }
            return;
        }

        setIsLoading(true);
        try {
            audio.pause();
            audio.src = track.audioUrl;
            audio.currentTime = 0;
            setCurrentTrack(track);
            setAudioReady(false);
            
            await audio.play();
            
            // Registrar el play en el backend
            try {
                await fetch('/landing/track-play', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        track_id: track.id,
                        track_number: track.trackNumber
                    })
                });
            } catch (err) {
                // Silenciar error de tracking
                console.log('Track play registered');
            }
        } catch (error) {
            console.error('[Audio Load Error]', error);
            setIsLoading(false);
            if (error.name === 'NotAllowedError') {
                setPlayError('Interacción requerida. Toca el botón de nuevo.');
            } else if (error.name === 'NotSupportedError') {
                setPlayError('Formato de audio no soportado en este dispositivo.');
            } else {
                setPlayError('No se pudo reproducir el audio.');
            }
        }
    };

    // Función para iniciar reproducción real
    const startAlbumPlayback = async () => {
        // Marcar que ha iniciado la experiencia
        setHasStartedListening(true);
        
        // Encontrar el track 1
        const track1 = data.tracks.find(t => t.trackNumber === 1);
        if (track1 && track1.audioUrl) {
            await handlePlayToggle(track1);
            // Scroll al tracklist
            document.getElementById('tracklist')?.scrollIntoView({ behavior: 'smooth' });
        } else {
            setPlayError('Track 1 no disponible.');
        }
    };

    // ESCUCHAR AHORA - Mostrar modal motivacional primero
    const handleListenNow = () => {
        if (!isUnlocked) {
            setIsModalOpen(true);
            return;
        }
        
        // Mostrar modal de inicio
        setShowStartModal(true);
    };

    // Reproducción continua - cuando termina un track, pasa al siguiente
    const playNextTrack = () => {
        if (!currentTrack || !data.tracks.length) return;
        
        const currentIndex = data.tracks.findIndex(t => t.trackNumber === currentTrack.trackNumber);
        if (currentIndex >= 0 && currentIndex < data.tracks.length - 1) {
            const nextTrack = data.tracks[currentIndex + 1];
            if (nextTrack && nextTrack.audioUrl) {
                handlePlayToggle(nextTrack);
            }
        }
    };

    const handleUnlockSubmit = async ({ email, fullName, country }) => {
        setIsSubmitting(true);
        setSubmitError('');

        try {
            console.log('[Landing] Enviando suscripción...', { email, fullName, country });
            
            const response = await fetch('/landing/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    full_name: fullName,
                    country,
                    source: 'landing_el_inmortal_2'
                })
            });

            console.log('[Landing] Respuesta:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'unknown' }));
                console.error('[Landing] Error del servidor:', errorData);
                
                if (errorData.error === 'missing_fields') {
                    throw new Error('Faltan campos requeridos.');
                } else if (errorData.error === 'email_invalid') {
                    throw new Error('El email no es válido.');
                } else if (errorData.error === 'server_error') {
                    throw new Error('Error del servidor. Por favor intenta más tarde.');
                } else {
                    throw new Error('No se pudo completar el registro.');
                }
            }

            const data = await response.json();
            console.log('[Landing] Éxito:', data);

            localStorage.setItem('landing_el_inmortal_unlock', '1');
            localStorage.setItem('ei2_registered', 'true');
            localStorage.setItem('ei2_email', email);
            localStorage.setItem('ei2_name', fullName);
            setIsUnlocked(true);
            setIsModalOpen(false);
            setSubmitError('');
            
            // Mostrar carrito VIP después de 1 segundo
            setTimeout(() => {
                setShowCartModal(true);
            }, 1000);
        } catch (error) {
            console.error('[Landing] Error:', error);
            setSubmitError(error.message || 'No se pudo registrar tu email. Intenta otra vez.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCommentSubmit = async (e) => {
        e.preventDefault();
        
        if (!newComment.trim() || newComment.trim().length < 3) {
            return;
        }
        
        // Check rate limiting (30 seconds between comments)
        if (lastCommentTime && Date.now() - lastCommentTime < 30000) {
            const secondsLeft = Math.ceil((30000 - (Date.now() - lastCommentTime)) / 1000);
            setCommentError(`Espera ${secondsLeft} segundos para comentar de nuevo`);
            setTimeout(() => setCommentError(''), 3000);
            return;
        }
        
        setIsSubmittingComment(true);
        setCommentError('');
        
        try {
            const response = await fetch('/landing/comments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ comment: newComment.trim() })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Add new comment to list with current user email
                const newCommentData = {
                    ...result.comment,
                    user_email: currentUserEmail
                };
                setComments(prev => [newCommentData, ...prev]);
                setNewComment('');
                setLastCommentTime(Date.now());
            } else {
                setCommentError(result.error || 'Error al publicar comentario');
                setTimeout(() => setCommentError(''), 3000);
            }
        } catch (error) {
            console.error('Error posting comment:', error);
            setCommentError('Error al publicar comentario');
            setTimeout(() => setCommentError(''), 3000);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (!confirm('¿Eliminar este comentario?')) return;
        
        try {
            const response = await fetch(`/landing/comments/${commentId}`, {
                method: 'DELETE',
                headers: { 'Accept': 'application/json' }
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                setComments(prev => prev.filter(c => c.id !== commentId));
            } else {
                alert(result.error || 'Error al eliminar comentario');
            }
        } catch (error) {
            console.error('Error deleting comment:', error);
            alert('Error al eliminar comentario');
        }
    };

    // Funciones para el sistema de reacciones y recompensas
    const handleSubmitReaction = async () => {
        console.log('[Reaction] Submitting reaction...');
        
        // Guardar referencia al track actual antes de limpiar
        const currentReactionTrack = reactionTrack;
        
        if (!reactionText.trim()) {
            // Si no hay reacción, simplemente cerrar y continuar
            console.log('[Reaction] Empty reaction, skipping...');
            closeReactionModal();
            return;
        }
        
        setIsSubmittingReaction(true);
        
        try {
            // Enviar reacción al servidor
            const response = await fetch('/landing/reaction', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    track_id: currentReactionTrack.id,
                    track_number: currentReactionTrack.trackNumber,
                    reaction: reactionText.trim()
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                console.log('[Reaction] Success! Generating reward...');
                // Generar recompensa
                generateReward(currentReactionTrack.trackNumber);
            } else {
                console.error('[Reaction] Server error:', result.error);
            }
        } catch (error) {
            console.error('[Reaction] Error submitting:', error);
        } finally {
            setIsSubmittingReaction(false);
            // Limpiar estados
            setShowReactionModal(false);
            setReactionText('');
            // Guardar el track en una variable temporal antes de limpiar
            const completedTrack = currentReactionTrack;
            setReactionTrack(null);
            
            // Continuar reproducción automáticamente después de un delay
            setTimeout(() => {
                console.log('[Reaction] Continuing to next track...');
                const currentIndex = data.tracks.findIndex(t => t.trackNumber === completedTrack?.trackNumber);
                console.log('[Reaction] Current index:', currentIndex, 'Total tracks:', data.tracks.length);
                
                if (currentIndex >= 0 && currentIndex < data.tracks.length - 1) {
                    const nextTrack = data.tracks[currentIndex + 1];
                    console.log('[Reaction] Next track:', nextTrack?.title);
                    if (nextTrack && nextTrack.audioUrl) {
                        console.log('[Reaction] Playing next track:', nextTrack.trackNumber);
                        handlePlayToggle(nextTrack);
                    } else {
                        console.error('[Reaction] Next track has no audio URL');
                    }
                } else {
                    console.log('[Reaction] No more tracks or album completed');
                }
            }, 500);
        }
    };
    
    const generateReward = (trackNumber) => {
        // Generar recompensa única para este track
        const rewards = [
            { type: 'image', title: 'Foto Exclusiva', description: 'Una imagen especial de Galante solo para ti' },
            { type: 'message', title: 'Mensaje Personal', description: 'Un mensaje de agradecimiento personalizado' },
            { type: 'behind_scenes', title: 'Detrás de Cámaras', description: 'Contenido exclusivo de la creación del álbum' },
            { type: 'sticker', title: 'Sticker Digital', description: 'Un sticker exclusivo para compartir' },
            { type: 'wallpaper', title: 'Wallpaper HD', description: 'Fondo de pantalla especial de El Inmortal 2' },
            { type: 'voice_note', title: 'Nota de Voz', description: 'Un saludo en audio de Galante' }
        ];
        
        // Seleccionar recompensa basada en el número de track (cíclico)
        const rewardIndex = (trackNumber - 1) % rewards.length;
        const reward = {
            ...rewards[rewardIndex],
            trackNumber: trackNumber,
            unlockedAt: new Date().toISOString()
        };
        
        setCurrentReward(reward);
        setCollectedRewards(prev => [...prev, reward]);
        setShowRewardModal(true);
    };
    
    const continueToNextTrack = (completedTrackNumber) => {
        console.log('[Reaction] Continuing from track', completedTrackNumber);
        const currentIndex = data.tracks.findIndex(t => t.trackNumber === completedTrackNumber);
        console.log('[Reaction] Found index:', currentIndex);
        
        if (currentIndex >= 0 && currentIndex < data.tracks.length - 1) {
            const nextTrack = data.tracks[currentIndex + 1];
            console.log('[Reaction] Next track to play:', nextTrack?.trackNumber, nextTrack?.title);
            if (nextTrack && nextTrack.audioUrl) {
                // Pequeño delay para asegurar que el modal se cerró
                setTimeout(() => {
                    handlePlayToggle(nextTrack);
                }, 300);
            } else {
                console.error('[Reaction] Next track has no audio URL');
            }
        } else if (currentIndex === data.tracks.length - 1) {
            console.log('[Reaction] This was the last track!');
        }
    };

    const closeReactionModal = () => {
        console.log('[Reaction] Closing modal...');
        const completedTrackNumber = reactionTrack?.trackNumber;
        
        // Cerrar modal primero
        setShowReactionModal(false);
        setReactionTrack(null);
        setReactionText('');
        
        // Luego continuar reproducción
        if (completedTrackNumber) {
            continueToNextTrack(completedTrackNumber);
        }
    };
    
    const skipReaction = () => {
        console.log('[Reaction] Skipping...');
        closeReactionModal();
    };

    // Fan Generator functions
    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('/api/v1/uploads', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok && result.url) {
                setUserPhoto(result.url);
            } else {
                alert('Error subiendo foto');
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert('Error subiendo foto');
        }
    };

    const handleGenerateVideo = async () => {
        if (!selectedLoop || !userPhoto) {
            alert('Selecciona un loop y sube tu foto');
            return;
        }
        
        setIsGeneratingVideo(true);
        
        try {
            const response = await fetch('/fan-generator/generate-video', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    loop_id: selectedLoop,
                    user_photo_path: userPhoto
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Poll for video status
                const checkStatus = setInterval(async () => {
                    const statusResponse = await fetch(`/fan-generator/video/${result.video_id}`);
                    const statusResult = await statusResponse.json();
                    
                    if (statusResult.success) {
                        if (statusResult.video.status === 'completed') {
                            setGeneratedVideo(statusResult.video);
                            setIsGeneratingVideo(false);
                            clearInterval(checkStatus);
                        } else if (statusResult.video.status === 'failed') {
                            alert('Error generando video');
                            setIsGeneratingVideo(false);
                            clearInterval(checkStatus);
                        }
                    }
                }, 3000);
                
                // Timeout after 2 minutes
                setTimeout(() => {
                    clearInterval(checkStatus);
                    setIsGeneratingVideo(false);
                }, 120000);
            } else {
                alert(result.error || 'Error creando video');
                setIsGeneratingVideo(false);
            }
        } catch (error) {
            console.error('Error generating video:', error);
            alert('Error generando video');
            setIsGeneratingVideo(false);
        }
    };

    return (
        <main className="relative overflow-hidden text-slate-100">
            {/* Background Effects */}
            <AudioWavesBackground />
            <FloatingParticles />
            <div className="hero-aurora" />

            {/* Modal de registro */}
            <SubscribeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleUnlockSubmit}
                isSubmitting={isSubmitting}
                error={submitError}
                detectedCountry={detectedCountry}
            />

            {/* Modal del Carrito VIP */}
            <CartModal
                isOpen={showCartModal}
                onClose={() => setShowCartModal(false)}
                cartItems={cartItems}
                setCartItems={setCartItems}
                isCheckingOut={isCheckingOut}
                setIsCheckingOut={setIsCheckingOut}
            />

            {/* Botón flotante para desbloquear */}
            {!isUnlocked && (
                <button 
                    className="floating-unlock-btn"
                    onClick={() => setIsModalOpen(true)}
                >
                    <span className="unlock-icon">🔓</span>
                    <span className="unlock-text">Desbloquear Álbum</span>
                </button>
            )}

            {/* ========================================
                HERO SECTION - FULLSCREEN
                ======================================== */}
            <section className="hero-fullscreen">
                <div className="reveal mb-6">
                    <p className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-300/10 px-5 py-2 text-xs uppercase tracking-[0.25em] text-amber-200 backdrop-blur-sm">
                        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400"></span>
                        Nuevo Album Oficial
                    </p>
                </div>

                {/* Album Title with Glitch Effect */}
                <h1 
                    className="font-display text-6xl leading-[0.9] text-white md:text-8xl lg:text-9xl glitch-text reveal reveal-delay-1"
                    data-text={data.albumName}
                >
                    {data.albumName}
                </h1>

                {/* Artist Name */}
                <p className="mt-4 text-lg font-medium uppercase tracking-[0.25em] text-cyan-300 md:text-xl reveal reveal-delay-2">
                    <TypingText text={data.artistName} />
                </p>

                {/* 3D Cover */}
                <div className="mt-10 reveal reveal-delay-2">
                    <Cover3D 
                        src={data.coverImage} 
                        alt={`${data.albumName} cover art`} 
                    />
                </div>

                {/* Stats Row */}
                <div className="mt-10 flex flex-wrap items-center justify-center gap-8 md:gap-12 reveal reveal-delay-3">
                    <div className="text-center">
                        <p className="stat-number">{data.stats.totalTracks || 21}</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Tracks</p>
                    </div>
                    <div className="h-12 w-px bg-gradient-to-b from-transparent via-slate-600 to-transparent"></div>
                    <div className="text-center">
                        <p className="stat-number">{data.stats.collaborators || 24}</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Colaboradores</p>
                    </div>
                    <div className="h-12 w-px bg-gradient-to-b from-transparent via-slate-600 to-transparent"></div>
                    <div className="text-center">
                        <p className="stat-number">{data.stats.featuredTracks || 11}</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Featurings</p>
                    </div>
                </div>

                {/* CTA Buttons */}
                <div className="mt-10 flex flex-wrap items-center justify-center gap-4 reveal reveal-delay-3">
                    {!isUnlocked ? (
                        <button 
                            onClick={() => setIsModalOpen(true)}
                            className="btn-neon"
                        >
                            <span>🔓</span>
                            <span>Desbloquear Álbum</span>
                        </button>
                    ) : (
                        <a href="#tracklist" className="btn-neon">
                            <span>🎵</span>
                            <span>Ver Tracklist</span>
                        </a>
                    )}
                    <button
                        onClick={handleListenNow}
                        className="btn-neon btn-neon-cyan"
                    >
                        <span>▶</span>
                        <span>Escuchar Ahora</span>
                    </button>
                </div>

                {/* Release Date Badge */}
                <div className="mt-8 glass-panel-enhanced px-6 py-4 reveal reveal-delay-3">
                    {countdown.launched ? (
                        <p className="text-sm font-semibold text-emerald-400">
                            <span className="mr-2">✓</span>
                            Pronto disponible en todas las plataformas
                        </p>
                    ) : (
                        <p className="text-sm text-slate-300">
                            <span className="text-slate-500 mr-2">Lanzamiento:</span>
                            <span className="font-semibold text-white">{releaseDateLabel}</span>
                            <span className="mx-3 text-slate-600">|</span>
                            <span className="font-semibold text-amber-300">{countdown.days}d</span>{' '}
                            <span className="font-semibold text-cyan-300">{countdown.hours}h</span>{' '}
                            <span className="font-semibold text-slate-300">{countdown.minutes}m</span>
                        </p>
                    )}
                </div>

                <ScrollIndicator />
            </section>

            {/* Stats cards section removed - now integrated in hero */}

            {/* ========================================
                FAN GENERATOR SECTION - TEMPORARILY DISABLED
                ======================================== */}
            {false && isUnlocked && (
                <section id="fan-generator" className="relative z-10 py-16 px-6">
                    <div className="mx-auto max-w-4xl">
                        <div className="text-center mb-8">
                            <h2 className="font-display text-3xl text-white md:text-4xl mb-4 reveal">
                                🎨 Crea tu Video
                            </h2>
                            <p className="text-slate-300 reveal reveal-delay-1">
                                Sube tu foto, elige un loop y genera un video único con el álbum
                            </p>
                        </div>

                        {!showFanGenerator ? (
                            <div className="text-center reveal reveal-delay-2">
                                <button
                                    onClick={() => setShowFanGenerator(true)}
                                    className="btn-neon btn-neon-cyan"
                                >
                                    <span>🎬</span>
                                    <span>Comenzar</span>
                                </button>
                            </div>
                        ) : (
                            <div className="glass-panel-enhanced rounded-3xl p-6 md:p-10 reveal">
                                {/* Step 1: Upload Photo */}
                                <div className="mb-8">
                                    <h3 className="text-xl text-white mb-4">1. Sube tu foto</h3>
                                    <div className="flex flex-col items-center gap-4">
                                        {userPhoto ? (
                                            <div className="relative">
                                                <img
                                                    src={userPhoto}
                                                    alt="Tu foto"
                                                    className="w-48 h-48 object-cover rounded-2xl"
                                                />
                                                <button
                                                    onClick={() => setUserPhoto(null)}
                                                    className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full text-white flex items-center justify-center"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="cursor-pointer">
                                                <div className="w-48 h-48 border-2 border-dashed border-slate-600 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-amber-400 hover:text-amber-400 transition-colors">
                                                    <span className="text-4xl mb-2">📷</span>
                                                    <span className="text-sm">Click para subir foto</span>
                                                </div>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handlePhotoUpload}
                                                    className="hidden"
                                                />
                                            </label>
                                        )}
                                    </div>
                                </div>

                                {/* Step 2: Select Loop */}
                                {userPhoto && (
                                    <div className="mb-8">
                                        <h3 className="text-xl text-white mb-4">2. Elige un loop</h3>
                                        {loops.length > 0 ? (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {loops.map((loop) => (
                                                    <button
                                                        key={loop.id}
                                                        onClick={() => setSelectedLoop(loop.id)}
                                                        className={`p-4 rounded-xl border-2 transition-all ${
                                                            selectedLoop === loop.id
                                                                ? 'border-amber-400 bg-amber-400/20'
                                                                : 'border-slate-600 hover:border-slate-400'
                                                        }`}
                                                    >
                                                        <div className="text-3xl mb-2">🎵</div>
                                                        <div className="text-sm text-white truncate">
                                                            {loop.name}
                                                        </div>
                                                        <div className="text-xs text-slate-400">
                                                            {loop.duration}s
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-slate-400 text-center">
                                                No hay loops disponibles aún
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Step 3: Generate */}
                                {userPhoto && selectedLoop && (
                                    <div className="text-center">
                                        <button
                                            onClick={handleGenerateVideo}
                                            disabled={isGeneratingVideo}
                                            className="btn-neon"
                                        >
                                            {isGeneratingVideo ? (
                                                <>
                                                    <span className="animate-spin">⏳</span>
                                                    <span>Generando...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>✨</span>
                                                    <span>Generar Video</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* Result */}
                                {generatedVideo && (
                                    <div className="mt-8 text-center">
                                        <h3 className="text-xl text-white mb-4">¡Tu video está listo!</h3>
                                        <video
                                            src={generatedVideo.video_path}
                                            controls
                                            className="w-full max-w-md mx-auto rounded-2xl"
                                        />
                                        <div className="mt-4 flex gap-4 justify-center">
                                            <a
                                                href={generatedVideo.video_path}
                                                download
                                                className="btn-neon btn-neon-cyan"
                                            >
                                                <span>⬇️</span>
                                                <span>Descargar</span>
                                            </a>
                                            <button
                                                onClick={() => {
                                                    setGeneratedVideo(null);
                                                    setUserPhoto(null);
                                                    setSelectedLoop(null);
                                                }}
                                                className="btn-small"
                                            >
                                                Crear otro
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ========================================
                TRACKLIST SECTION
                ======================================== */}
            <section id="tracklist" className="relative z-10 mx-auto mt-10 w-full max-w-6xl px-6 pb-20 md:px-10">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <h2 className="font-display text-4xl text-white md:text-5xl">
                        <span className="text-amber-400">#</span> Tracklist
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setFilter('all')}
                            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                                filter === 'all'
                                    ? 'bg-amber-300 text-slate-900'
                                    : 'border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'
                            }`}
                        >
                            Todos
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilter('featured')}
                            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                                filter === 'featured'
                                    ? 'bg-amber-300 text-slate-900'
                                    : 'border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'
                            }`}
                        >
                            Featurings
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilter('core')}
                            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                                filter === 'core'
                                    ? 'bg-amber-300 text-slate-900'
                                    : 'border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'
                            }`}
                        >
                            Solo Galante
                        </button>
                    </div>
                </div>

                {!isUnlocked ? (
                    <div className="tracklist-locked glass-panel-enhanced rounded-3xl border border-amber-300/20 p-10 md:p-16 text-center relative overflow-hidden">
                        {/* Background glow */}
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-cyan-500/5 pointer-events-none"></div>
                        
                        <div className="relative z-10">
                            <div className="locked-icon text-7xl mb-4 animate-pulse">🔒</div>
                            <h3 className="font-display text-4xl text-white md:text-5xl">
                                Tracklist <span className="text-amber-400">Bloqueado</span>
                            </h3>
                            <p className="mt-4 max-w-lg mx-auto text-base leading-7 text-slate-300">
                                Regístrate con tu email para desbloquear el tracklist completo y escuchar 
                                todas las <span className="text-amber-300 font-semibold">21 canciones</span> antes que nadie.
                            </p>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="btn-neon mt-8"
                            >
                                <span>🔓</span>
                                <span>Desbloquear Ahora</span>
                            </button>
                            <p className="mt-6 text-sm text-slate-400">
                                <span className="text-amber-400 font-semibold">+{fanStats.totalLeads || '1,247'}</span> fans ya se han registrado
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {currentTrack ? (
                            <div className="mb-4 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
                                Reproduciendo: <span className="font-semibold text-white">{currentTrack.title}</span>
                            </div>
                        ) : null}
                        {playError ? (
                            <div className="mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs uppercase tracking-[0.12em] text-rose-200">
                                {playError}
                            </div>
                        ) : null}

                        <div className="mb-5 grid gap-3 md:grid-cols-2">
                            <div className="glass-panel rounded-2xl p-4 flex flex-col">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-300 mb-3">💬 Comentarios de Fans</p>
                                
                                {/* Error de rate limiting */}
                                {commentError && (
                                    <div className="mb-2 px-3 py-2 bg-red-500/20 border border-red-500/50 rounded-lg text-xs text-red-300">
                                        {commentError}
                                    </div>
                                )}
                                
                                {/* Emoji picker */}
                                <div className="flex gap-2 mb-2 flex-wrap">
                                    {['🔥', '❤️', '🎵', '🎧', '👑', '💯', '🙌', '🎤', '🎸', '🔊', '⚡'].map((emoji, idx) => (
                                        <span
                                            key={`${emoji}-${idx}`}
                                            onClick={() => setNewComment(prev => prev + emoji)}
                                            style={{cursor: 'pointer', fontSize: '20px'}}
                                            title={`Agregar ${emoji}`}
                                        >
                                            {emoji}
                                        </span>
                                    ))}
                                </div>

                                {/* Formulario de comentario */}
                                <form onSubmit={handleCommentSubmit} className="mb-3">
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Deja tu comentario..."
                                        maxLength={500}
                                        rows={2}
                                        className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-sm text-black placeholder-slate-400 focus:outline-none focus:border-amber-400 resize-none"
                                    />
                                    <div className="flex justify-between items-center mt-2">
                                        <span className="text-xs text-slate-400">{newComment.length}/500</span>
                                        <button
                                            type="submit"
                                            disabled={isSubmittingComment || newComment.trim().length < 3}
                                            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-slate-900 transition-colors"
                                        >
                                            {isSubmittingComment ? '...' : 'Publicar'}
                                        </button>
                                    </div>
                                </form>
                                
                                {/* Indicador de rotación */}
                                {comments.length > 4 && (
                                    <div className="flex justify-center gap-1 mb-2">
                                        {Array.from({ length: Math.min(4, Math.ceil(comments.length / 4)) }).map((_, idx) => (
                                            <div
                                                key={idx}
                                                className={`w-2 h-2 rounded-full transition-colors ${
                                                    idx === Math.floor(commentRotationIndex / 4) % Math.min(4, Math.ceil(comments.length / 4))
                                                        ? 'bg-amber-400'
                                                        : 'bg-slate-600'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                )}
                                
                                {/* Lista de comentarios (máximo 4 visibles) */}
                                <div className="flex-1 overflow-hidden space-y-2">
                                    {visibleComments.length > 0 ? (
                                        visibleComments.map((comment) => (
                                            <div key={comment.id} className="bg-slate-800/30 rounded-lg p-2 text-sm">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-semibold text-amber-300 text-xs">{comment.user_name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-slate-500">
                                                            {new Date(comment.created_at).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                                                        </span>
                                                        {/* Botón borrar solo si es comentario del usuario */}
                                                        {!comment.id.toString().startsWith('sample_') &&
                                                         (comment.user_email === currentUserEmail || comment.user_id) && (
                                                            <span
                                                                onClick={() => handleDeleteComment(comment.id)}
                                                                style={{cursor: 'pointer', fontSize: '12px'}}
                                                                title="Borrar comentario"
                                                            >
                                                                🗑️
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-slate-200 text-xs leading-relaxed">{comment.comment}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-400 text-xs text-center py-4">Sé el primero en comentar 🎵</p>
                                    )}
                                </div>
                            </div>
                            <div className="glass-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Top 10 - Mas Escuchados</p>
                                <div className="mt-3 space-y-2 text-sm text-slate-200 max-h-48 overflow-y-auto">
                                    {topTracks.length > 0 ? (
                                        topTracks.map((track, index) => (
                                            <div key={track.id} className="flex items-center justify-between group cursor-pointer hover:bg-white/5 p-1 rounded transition" onClick={() => {
                                                const trackData = data.tracks.find(t => t.id === track.id || t.trackNumber === track.track_number);
                                                if (trackData) handlePlayToggle(trackData);
                                            }}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-amber-400 font-bold w-5">{index + 1}</span>
                                                    <span className="truncate max-w-[140px] group-hover:text-amber-300 transition">{track.title}</span>
                                                </div>
                                                <span className="text-amber-300 text-xs">{track.play_count} plays</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-400">Reproduce para ver el ranking.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            {filteredTracks.map((track) => (
                                <article
                                    key={`${track.trackNumber}-${track.title}`}
                                    className="track-card glass-panel-enhanced rounded-2xl p-5 group"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="font-display text-4xl leading-none bg-gradient-to-br from-amber-300 to-amber-500 bg-clip-text text-transparent group-hover:from-amber-200 group-hover:to-amber-400 transition-all">
                                            {formatTrackNumber(track.trackNumber)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-base font-semibold text-white truncate group-hover:text-amber-100 transition-colors">{track.title}</p>
                                            <p className="mt-1 text-xs uppercase tracking-[0.11em] text-cyan-300/80">
                                                Prod. {track.producer || 'Pendiente'}
                                            </p>
                                            {track.features ? (
                                                <p className="mt-2 text-sm text-amber-200/90 flex items-center gap-2">
                                                    <span className="text-xs bg-amber-500/20 px-2 py-0.5 rounded-full">FEAT</span>
                                                    {track.features}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="pt-1 flex flex-col gap-2 shrink-0">
                                            {(() => {
                                                const trackIndex = data.tracks.findIndex(t => t.trackNumber === track.trackNumber);
                                                const isLocked = !hasStartedListening || trackIndex > currentUnlockIndex;
                                                const isCurrentTrack = currentTrack && currentTrack.trackNumber === track.trackNumber;
                                                
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePlayToggle(track)}
                                                        disabled={isLocked || (isLoading && isCurrentTrack)}
                                                        className={`rounded-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                                            isLocked
                                                                ? 'cursor-not-allowed border border-slate-600 bg-slate-800/50 text-slate-500'
                                                                : isLoading && isCurrentTrack
                                                                    ? 'cursor-wait border border-white/20 bg-white/5 text-slate-400'
                                                                    : isCurrentTrack && isPlaying
                                                                        ? 'border-2 border-emerald-400 bg-emerald-400/20 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.3)]'
                                                                        : track.audioUrl
                                                                            ? 'border border-amber-400 bg-amber-400 text-slate-900 font-extrabold hover:bg-amber-300 hover:border-amber-300 hover:shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                                                                            : 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'
                                                        }`}
                                                    >
                                                        {isLocked
                                                            ? '🔒 Locked'
                                                            : isCurrentTrack
                                                                ? isLoading
                                                                    ? '...'
                                                                    : isPlaying
                                                                        ? '⏸ Pause'
                                                                        : '▶ Play'
                                                                : track.audioUrl
                                                                    ? '▶ Play'
                                                                    : '—'}
                                                    </button>
                                                );
                                            })()}
                                            {track.id && (
                                                <button
                                                    onClick={() => {
                                                        if (!isUnlocked) {
                                                            setIsModalOpen(true);
                                                        } else {
                                                            setSelectedTrackForInfo(track);
                                                            setShowTrackInfoModal(true);
                                                        }
                                                    }}
                                                    className="rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all border border-cyan-500/50 bg-cyan-500/20 text-slate-900 hover:bg-cyan-400/30 hover:border-cyan-500 text-center"
                                                >
                                                    Info
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}
            </section>

            <audio 
                ref={audioRef} 
                preload="metadata"
                playsInline
                controls={false}
                onContextMenu={(e) => e.preventDefault()}
                style={{ 
                    pointerEvents: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none'
                }}
            />

            {/* ========================================
                MINI-DISC CTA SECTION
                ======================================== */}
            <section id="minidisc-cta" className="relative z-10 py-20 px-6 bg-gradient-to-b from-slate-900 to-slate-950">
                <div className="mx-auto max-w-4xl text-center">
                    <div className="glass-panel-enhanced rounded-3xl p-8 md:p-12 border border-amber-500/30">
                        <div className="text-6xl mb-6">💿</div>
                        <h2 className="font-display text-3xl md:text-4xl text-white mb-4">
                            Mini-Disc Edición Limitada
                        </h2>
                        <p className="text-slate-300 mb-6 max-w-xl mx-auto">
                            Consigue el álbum en formato físico exclusivo. Edición firmada por Galante con envío incluido.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4 mb-8">
                            <div className="text-center px-4">
                                <p className="text-2xl font-bold text-amber-400">$15</p>
                                <p className="text-xs text-slate-400">Mini-Disc Firmado</p>
                            </div>
                            <div className="w-px bg-white/10"></div>
                            <div className="text-center px-4">
                                <p className="text-2xl font-bold text-amber-400">$25</p>
                                <p className="text-xs text-slate-400">+ Video Saludo</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setShowCartModal(true)}
                            className="btn-neon"
                        >
                            <span>💿</span>
                            <span>Reservar Mini-Disc</span>
                        </button>
                    </div>
                </div>
            </section>

            {/* ========================================
                FOOTER
                ======================================== */}
            <footer className="relative z-10 border-t border-white/10 bg-slate-950/80 backdrop-blur-lg">
                <div className="mx-auto max-w-6xl px-6 py-12 md:px-10">
                    <div className="flex flex-col items-center gap-8 text-center">
                        {/* Streaming Platforms */}
                        <div>
                            <h4 className="font-display text-xl text-white mb-4">
                                Escucha en tu plataforma favorita
                            </h4>
                            <p className="text-sm text-slate-400 mb-4">
                                Disponible en todas las plataformas digitales
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-4">
                                <a href={data.streamingLinks.spotify || '#'} className="streaming-btn bg-[#1DB954] hover:scale-110 transition-transform" title="Spotify">
                                    <svg className="h-7 w-7" fill="white" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                                </a>
                                <a href={data.streamingLinks.youtube || '#'} className="streaming-btn bg-[#FF0000] hover:scale-110 transition-transform" title="YouTube">
                                    <svg className="h-7 w-7" fill="white" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                                </a>
                                <a href={data.streamingLinks.appleMusic || '#'} className="streaming-btn bg-[#FA243C] hover:scale-110 transition-transform" title="Apple Music">
                                    <svg className="h-7 w-7" fill="white" viewBox="0 0 24 24"><path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.214.265-1.333.272-2.397.918-3.062 2.065a4.845 4.845 0 00-.676 1.992 9.51 9.51 0 00-.099 1.114c-.004.064-.01.13-.01.195v8.16c.01.12.017.242.024.363.04.718.106 1.435.238 2.144.24 1.27.793 2.273 1.805 3.02.913.672 1.955 1.012 3.082 1.147.737.09 1.48.153 2.22.177.18.01.363.014.543.014h11.19c.065-.003.133-.01.195-.012.798-.024 1.596-.086 2.385-.208 1.21-.19 2.235-.666 3.026-1.505.684-.726 1.078-1.59 1.23-2.59.06-.417.093-.84.108-1.265.01-.134.02-.269.02-.404V6.514c0-.135-.01-.269-.02-.39zm-6.5 6.044l-4.6 3.24c-.24.17-.54.186-.78.04-.06-.04-.11-.09-.15-.146V7.4c.02-.06.06-.12.1-.17.16-.16.4-.19.6-.08l4.59 3.23c.04.03.07.07.1.11.12.2.12.44-.02.64-.04.04-.08.08-.13.11l.19.14z"/></svg>
                                </a>
                            </div>
                        </div>

                        <div className="w-full max-w-xs h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

                        {/* Logo/Name */}
                        <h3 className="font-display text-3xl text-white">
                            Galante <span className="text-amber-400">El Emperador</span>
                        </h3>
                        
                        {/* Social Links */}
                        <div className="flex items-center gap-4">
                            <a href="https://instagram.com/galantealx" target="_blank" rel="noopener noreferrer" 
                               className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-all hover:border-pink-500 hover:bg-pink-500/20 hover:text-pink-400 hover:scale-110">
                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                            </a>
                            <a href="https://twitter.com/galantealx" target="_blank" rel="noopener noreferrer"
                               className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-all hover:border-sky-500 hover:bg-sky-500/20 hover:text-sky-400 hover:scale-110">
                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                            </a>
                            <a href="https://youtube.com/@galantealx" target="_blank" rel="noopener noreferrer"
                               className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-all hover:border-red-500 hover:bg-red-500/20 hover:text-red-400 hover:scale-110">
                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                            </a>
                            <a href="https://tiktok.com/@galantealx" target="_blank" rel="noopener noreferrer"
                               className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-all hover:border-cyan-400 hover:bg-cyan-400/20 hover:text-cyan-300 hover:scale-110">
                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                            </a>
                        </div>

                        {/* Copyright */}
                        <p className="text-sm text-slate-500">
                            © {new Date().getFullYear()} Galante El Emperador. Todos los derechos reservados.
                        </p>
                    </div>
                </div>
            </footer>
        </main>

        {/* ========================================
            MODALES GLOBALES - FUERA DEL MAIN PARA Z-INDEX CORRECTO
            ======================================== */}
        
        {/* Modal de Reacción */}
        {showReactionModal && (
            <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(4px)'
            }}>
                <div className="glass-panel-enhanced rounded-3xl p-8 max-w-md w-full text-center">
                    <div className="text-6xl mb-4">🎤</div>
                    <h3 className="text-2xl font-bold text-white mb-2">
                        ¡Track {reactionTrack?.trackNumber} Completado!
                    </h3>
                    <p className="text-slate-300 mb-6">
                        ¿Qué te pareció <span className="text-amber-400 font-semibold">{reactionTrack?.title}</span>?
                    </p>
                    
                    <textarea
                        value={reactionText}
                        onChange={(e) => setReactionText(e.target.value)}
                        placeholder="Deja tu reacción aquí... (opcional)"
                        className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-black placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none mb-4"
                        rows={3}
                    />
                    
                    <p className="text-xs text-slate-400 mb-6">
                        💡 Si dejas tu reacción, desbloquearás una sorpresa exclusiva
                    </p>
                    
                    <div className="flex gap-3">
                        <button
                            onClick={skipReaction}
                            className="flex-1 px-4 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 transition-all"
                        >
                            Saltar
                        </button>
                        <button
                            onClick={handleSubmitReaction}
                            disabled={isSubmittingReaction}
                            className="flex-1 px-4 py-3 rounded-xl bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 transition-all disabled:opacity-50"
                        >
                            {isSubmittingReaction ? '...' : 'Enviar 💝'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Modal de Recompensa */}
        {showRewardModal && currentReward && (
            <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(4px)'
            }}>
                <div className="glass-panel-enhanced rounded-3xl p-8 max-w-md w-full text-center">
                    <div className="text-6xl mb-4 animate-bounce">🎁</div>
                    <h3 className="text-2xl font-bold text-white mb-2">
                        ¡Recompensa Desbloqueada!
                    </h3>
                    <p className="text-amber-400 font-semibold mb-4">
                        {currentReward.title}
                    </p>
                    <p className="text-slate-300 mb-6">
                        {currentReward.description}
                    </p>
                    
                    <div className="bg-gradient-to-br from-amber-500/20 to-purple-500/20 rounded-2xl p-6 mb-6 border border-amber-500/30">
                        <div className="text-5xl mb-2">🏆</div>
                        <p className="text-sm text-slate-400">
                            Recompensa #{currentReward.trackNumber} de 21
                        </p>
                    </div>
                    
                    <button
                        onClick={() => {
                            setShowRewardModal(false);
                            setCurrentReward(null);
                        }}
                        className="w-full px-4 py-3 rounded-xl bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 transition-all"
                    >
                        ¡Genial! Continuar →
                    </button>
                </div>
            </div>
        )}

        {/* Modal de Inicio */}
        {showStartModal && (
            <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(4px)'
            }}>
                <div className="glass-panel-enhanced rounded-3xl p-8 max-w-md w-full text-center">
                    <div className="text-6xl mb-4 animate-pulse">🎵</div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                        ¡Comienza la Experiencia!
                    </h3>
                    
                    <div className="bg-gradient-to-br from-amber-500/20 to-purple-500/20 rounded-2xl p-6 mb-6 border border-amber-500/30">
                        <div className="text-4xl mb-2">🔓</div>
                        <p className="text-amber-300 font-semibold mb-2">
                            Desbloquea 21 Collectibles
                        </p>
                        <p className="text-sm text-slate-300">
                            Escucha cada track y desbloquea recompensas exclusivas. 
                            El próximo collectible te espera después del Track 1.
                        </p>
                    </div>

                    <p className="text-slate-400 text-sm mb-6">
                        🎁 Sorpresas exclusivas por cada reacción que dejes
                    </p>
                    
                    <button
                        onClick={() => {
                            setShowStartModal(false);
                            startAlbumPlayback();
                        }}
                        className="w-full px-4 py-3 rounded-xl bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 transition-all"
                    >
                        ¡Vamos! 🚀
                    </button>
                </div>
            </div>
        )}

        {/* Modal de Completación */}
        {showCompletionModal && (
            <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(4px)'
            }}>
                <div className="glass-panel-enhanced rounded-3xl p-8 max-w-md w-full text-center">
                    <div className="text-6xl mb-4 animate-bounce">🎉</div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                        ¡Felicidades! 🏆
                    </h3>
                    
                    <div className="bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 rounded-2xl p-6 mb-6 border border-emerald-500/30">
                        <div className="text-4xl mb-2">💎</div>
                        <p className="text-emerald-300 font-semibold mb-2">
                            Álbum Completado
                        </p>
                        <p className="text-sm text-slate-300">
                            Has escuchado todos los 21 tracks de "El Inmortal 2". 
                            Eres uno de los primeros en experimentar este estreno mundial diferente.
                        </p>
                    </div>

                    <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
                        <p className="text-amber-400 font-semibold mb-2">
                            🎵 Próximamente en Spotify
                        </p>
                        <p className="text-sm text-slate-400">
                            El álbum oficial se lanzará pronto en todas las plataformas. 
                            Tú ya lo conoces completo. ¡Gracias por ser parte de esta experiencia única!
                        </p>
                    </div>
                    
                    <button
                        onClick={() => setShowCompletionModal(false)}
                        className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold hover:from-amber-400 hover:to-orange-400 transition-all"
                    >
                        ¡Eres Legendario! 👑
                    </button>
                </div>
            </div>
        )}

        {/* Modal de Info del Track */}
        {showTrackInfoModal && selectedTrackForInfo && (
            <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(4px)'
            }} onClick={() => setShowTrackInfoModal(false)}>
                <div className="glass-panel-enhanced rounded-3xl p-6 md:p-8 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <p className="text-amber-400 text-sm font-bold uppercase tracking-wider mb-1">
                                Track {String(selectedTrackForInfo.trackNumber).padStart(2, '0')}
                            </p>
                            <h3 className="text-2xl md:text-3xl font-bold text-white">
                                {selectedTrackForInfo.title}
                            </h3>
                        </div>
                        <button
                            onClick={() => setShowTrackInfoModal(false)}
                            className="text-slate-400 hover:text-white transition-colors text-2xl"
                        >
                            ×
                        </button>
                    </div>

                    {/* Track Details */}
                    <div className="space-y-4 mb-6">
                        {selectedTrackForInfo.producer && (
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                                <span className="text-2xl">🎹</span>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider">Productor</p>
                                    <p className="text-white font-semibold">{selectedTrackForInfo.producer}</p>
                                </div>
                            </div>
                        )}

                        {selectedTrackForInfo.features && (
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                                <span className="text-2xl">🎤</span>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider">Featuring</p>
                                    <p className="text-white font-semibold">{selectedTrackForInfo.features}</p>
                                </div>
                            </div>
                        )}

                        {selectedTrackForInfo.bpm && (
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                                <span className="text-2xl">⏱️</span>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider">BPM</p>
                                    <p className="text-white font-semibold">{selectedTrackForInfo.bpm}</p>
                                </div>
                            </div>
                        )}

                        {selectedTrackForInfo.key && (
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                                <span className="text-2xl">🎵</span>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider">Tonalidad</p>
                                    <p className="text-white font-semibold">{selectedTrackForInfo.key}</p>
                                </div>
                            </div>
                        )}

                        {selectedTrackForInfo.duration && (
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                                <span className="text-2xl">⏳</span>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider">Duración</p>
                                    <p className="text-white font-semibold">{selectedTrackForInfo.duration}</p>
                                </div>
                            </div>
                        )}

                        {selectedTrackForInfo.description && (
                            <div className="p-4 bg-gradient-to-r from-amber-500/10 to-cyan-500/10 rounded-xl border border-amber-500/20">
                                <p className="text-xs text-amber-400 uppercase tracking-wider mb-2">Sobre el track</p>
                                <p className="text-slate-300 text-sm leading-relaxed">{selectedTrackForInfo.description}</p>
                            </div>
                        )}
                    </div>

                    {/* Play Button */}
                    <button
                        onClick={() => {
                            setShowTrackInfoModal(false);
                            // Small delay to allow modal to close before playing
                            setTimeout(() => handlePlayToggle(selectedTrackForInfo), 100);
                        }}
                        className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold hover:from-amber-400 hover:to-orange-400 transition-all flex items-center justify-center gap-2"
                    >
                        <span>▶</span>
                        <span>Reproducir Track</span>
                    </button>
                </div>
            </div>
        )}
    </>
    );
}

function bootstrap() {
    const target = document.getElementById('album-landing-root');
    if (!target) return;

    const hydratedData = coerceLandingData(window.__ALBUM_LANDING_DATA__ || DEFAULT_LANDING_DATA);
    createRoot(target).render(<LandingApp data={hydratedData} />);
}

bootstrap();
