import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

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
        youtubeMusic: '',
        deezer: ''
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

function LandingApp({ data }) {
    const [countdown, setCountdown] = useState(() => getCountdown(data.releaseDate));
    const [filter, setFilter] = useState('all');
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [detectedCountry, setDetectedCountry] = useState('');
    const [fanStats, setFanStats] = useState({ totalLeads: 0, topCountries: [] });
    const [currentTrack, setCurrentTrack] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [playError, setPlayError] = useState('');
    const [audioReady, setAudioReady] = useState(false);
    const audioRef = useRef(null);

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

    // Auto-abrir modal después de 3 segundos si no está desbloqueado
    useEffect(() => {
        const storageKey = 'landing_el_inmortal_unlock';
        const isAlreadyUnlocked = localStorage.getItem(storageKey) === '1';
        
        if (isAlreadyUnlocked) {
            setIsUnlocked(true);
        } else {
            const timer = setTimeout(() => {
                setIsModalOpen(true);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(getCountdown(data.releaseDate));
        }, 1000 * 30);

        return () => clearInterval(timer);
    }, [data.releaseDate]);

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
        fetchStats();
    }, [isUnlocked]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return undefined;

        const handleEnded = () => {
            setIsPlaying(false);
            setIsLoading(false);
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

    const handlePlayToggle = async (track) => {
        if (!isUnlocked) {
            setIsModalOpen(true);
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
            setIsUnlocked(true);
            setIsModalOpen(false);
            setSubmitError('');
        } catch (error) {
            console.error('[Landing] Error:', error);
            setSubmitError(error.message || 'No se pudo registrar tu email. Intenta otra vez.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="relative overflow-hidden pb-20 text-slate-100">
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

            <section className="mx-auto grid w-full max-w-6xl gap-8 px-6 pt-12 md:px-10 md:pt-16 lg:grid-cols-[1.15fr,0.85fr] lg:items-end">
                <div className="reveal">
                    <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-amber-300/10 px-4 py-1 text-xs uppercase tracking-[0.2em] text-amber-200">
                        Nuevo album oficial
                    </p>

                    <h1 className="font-display text-6xl leading-[0.88] text-white md:text-7xl lg:text-8xl">
                        {data.albumName}
                    </h1>

                    <p className="mt-2 text-base font-medium uppercase tracking-[0.16em] text-cyan-200/85 md:text-lg">
                        {data.artistName}
                    </p>

                    <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                        {data.description}
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-4">
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Disponible en:</span>
                        <div className="flex gap-3">
                            <a href={data.streamingLinks.spotify || '#'} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1DB954] text-white transition hover:scale-110 hover:shadow-lg" title="Spotify">
                                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                            </a>
                            <a href={data.streamingLinks.youtubeMusic || '#'} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FF0000] text-white transition hover:scale-110 hover:shadow-lg" title="YouTube Music">
                                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228 18.228 15.432 18.228 12 15.432 5.772 12 5.772zM9.684 15.852V8.148L15.816 12l-6.132 3.852z"/></svg>
                            </a>
                            <a href={data.streamingLinks.appleMusic || '#'} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FA243C] text-white transition hover:scale-110 hover:shadow-lg" title="Apple Music">
                                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.214.265-1.333.272-2.397.918-3.062 2.065a4.845 4.845 0 00-.676 1.992 9.51 9.51 0 00-.099 1.114c-.004.064-.01.13-.01.195v8.16c.01.12.017.242.024.363.04.718.106 1.435.238 2.144.24 1.27.793 2.273 1.805 3.02.913.672 1.955 1.012 3.082 1.147.737.09 1.48.153 2.22.177.18.01.363.014.543.014h11.19c.065-.003.133-.01.195-.012.798-.024 1.596-.086 2.385-.208 1.21-.19 2.235-.666 3.026-1.505.684-.726 1.078-1.59 1.23-2.59.06-.417.093-.84.108-1.265.01-.134.02-.269.02-.404V6.514c0-.135-.01-.269-.02-.39zm-6.5 6.044l-4.6 3.24c-.24.17-.54.186-.78.04-.06-.04-.11-.09-.15-.146V7.4c.02-.06.06-.12.1-.17.16-.16.4-.19.6-.08l4.59 3.23c.04.03.07.07.1.11.12.2.12.44-.02.64-.04.04-.08.08-.13.11l.19.14z"/></svg>
                            </a>
                            <a href={data.streamingLinks.deezer || '#'} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FF0000] text-white transition hover:scale-110 hover:shadow-lg" title="Deezer">
                                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm4.8 16.8h-2.4v-4.8H12v4.8H9.6v-4.8H7.2v4.8H4.8V7.2h2.4v4.8h2.4V7.2H12v4.8h2.4V7.2h2.4v9.6z"/></svg>
                            </a>
                            <a href={data.streamingLinks.amazonMusic || '#'} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00A8E1] text-white transition hover:scale-110 hover:shadow-lg" title="Amazon Music">
                                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.582l.315-.118c.138-.053.209-.053.276 0 .053.043.072.115.043.206-.138.548-.206.986-.206 1.314 0 1.507 1.186 2.666 2.68 2.666.434 0 .872-.108 1.308-.339.051-.023.107-.023.152 0 .044.021.067.064.067.118 0 .06-.024.098-.067.126-1.13.77-2.41 1.206-3.79 1.206-1.45 0-2.76-.47-3.93-1.41-.39-.32-.8-.53-1.23-.64-.43-.11-.84-.05-1.24.17-2.27 1.35-4.79 2.02-7.56 2.02-2.4 0-4.65-.5-6.75-1.51-.55-.26-.93-.35-1.14-.26-.21.09-.33.3-.38.64-.05.34-.18.6-.38.8-.2.2-.5.3-.9.3-.76 0-1.39-.27-1.88-.82-.5-.55-.75-1.22-.75-2.03 0-.57.14-1.18.41-1.83.27-.65.66-1.29 1.15-1.93zm5.19-1.65c-.12-.063-.18-.142-.18-.237 0-.06.02-.12.06-.18l2.32-3.17c.08-.11.18-.16.3-.16.12 0 .22.05.3.16l2.32 3.17c.04.06.06.12.06.18 0 .095-.06.174-.18.237l-.48.27c-.12.063-.22.063-.3 0-.08-.063-.12-.142-.12-.237v-1.8h-2.86v1.8c0 .095-.04.174-.12.237-.08.063-.18.063-.3 0l-.48-.27zm4.99 0c-.12-.063-.18-.142-.18-.237 0-.06.02-.12.06-.18l2.32-3.17c.08-.11.18-.16.3-.16.12 0 .22.05.3.16l2.32 3.17c.04.06.06.12.06.18 0 .095-.06.174-.18.237l-.48.27c-.12.063-.22.063-.3 0-.08-.063-.12-.142-.12-.237v-1.8h-2.86v1.8c0 .095-.04.174-.12.237-.08.063-.18.063-.3 0l-.48-.27z"/></svg>
                            </a>
                            <a href={data.streamingLinks.tidal || '#'} className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-white transition hover:scale-110 hover:shadow-lg" title="Tidal">
                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.012 0L6.555 5.447l5.457 5.454L6.555 16.35l5.457 5.454 5.463-5.454-5.463-5.449 5.463-5.454L12.012 0zm5.463 5.447l-5.463 5.454 5.463 5.449-5.457 5.454L6.555 16.35l5.463-5.454-5.463-5.449L12.018 0l5.457 5.447z"/></svg>
                            </a>
                        </div>
                    </div>
                </div>

                <aside className="glass-panel reveal reveal-delay-1 rounded-3xl p-5 shadow-stage md:p-6">
                    <div className="overflow-hidden rounded-2xl border border-slate-100/10 bg-slate-950/65">
                        <img
                            src={data.coverImage}
                            alt={`${data.albumName} cover art`}
                            className="h-full min-h-[280px] w-full object-cover"
                        />
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/65 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Release</p>
                        <p className="mt-2 text-sm font-semibold capitalize text-slate-100">{releaseDateLabel}</p>
                        {countdown.launched ? (
                            <p className="mt-3 text-sm font-semibold text-emerald-300">El album ya esta activo en plataformas.</p>
                        ) : (
                            <p className="mt-3 text-sm text-slate-300">
                                Faltan{' '}
                                <span className="font-semibold text-amber-300">{countdown.days}d</span>{' '}
                                <span className="font-semibold text-cyan-200">{countdown.hours}h</span>{' '}
                                <span className="font-semibold text-slate-100">{countdown.minutes}m</span>
                            </p>
                        )}
                    </div>
                </aside>
            </section>

            <section className="mx-auto mt-8 grid w-full max-w-6xl gap-4 px-6 md:mt-10 md:grid-cols-3 md:px-10">
                {cards.map((card, index) => (
                    <article
                        key={card.label}
                        className={`glass-panel reveal rounded-2xl p-5 reveal-delay-${Math.min(index + 1, 3)}`}
                    >
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">{card.label}</p>
                        <p className="mt-2 text-4xl font-semibold text-white">{card.value}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-400">{card.detail}</p>
                    </article>
                ))}
            </section>

            <section className="mx-auto mt-10 w-full max-w-6xl px-6 md:px-10">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-display text-4xl text-white md:text-5xl">Tracklist</h2>
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
                    <div className="tracklist-locked glass-panel rounded-3xl border border-amber-200/30 bg-slate-950/70 p-8 md:p-12 text-center">
                        <div className="locked-icon">🔒</div>
                        <h3 className="mt-4 font-display text-3xl text-white md:text-4xl">
                            Tracklist Bloqueado
                        </h3>
                        <p className="mt-3 max-w-xl mx-auto text-sm leading-7 text-slate-300 md:text-base">
                            Regístrate con tu email para desbloquear el tracklist completo y escuchar 
                            todas las 21 canciones antes que nadie.
                        </p>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="mt-6 rounded-full bg-amber-400 px-8 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-amber-300 hover:scale-105"
                        >
                            🔓 Desbloquear Ahora
                        </button>
                        <p className="mt-4 text-xs text-slate-500">
                            +{fanStats.totalLeads || '1,247'} fans ya se han registrado
                        </p>
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
                            <div className="glass-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Descargas por pais</p>
                                <p className="mt-2 text-3xl font-semibold text-white">{fanStats.totalLeads}</p>
                                <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-400">Registros totales</p>
                            </div>
                            <div className="glass-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Top paises</p>
                                <div className="mt-3 space-y-2 text-sm text-slate-200">
                                    {fanStats.topCountries.length ? (
                                        fanStats.topCountries.map((item) => (
                                            <div key={item.country} className="flex items-center justify-between">
                                                <span>{item.country}</span>
                                                <span className="text-amber-300">{item.total}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-400">Sin datos aun.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            {filteredTracks.map((track) => (
                                <article
                                    key={`${track.trackNumber}-${track.title}`}
                                    className="track-card glass-panel rounded-2xl p-4"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="font-display text-3xl leading-none text-amber-300">
                                            {formatTrackNumber(track.trackNumber)}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-base font-semibold text-white">{track.title}</p>
                                            <p className="mt-1 text-xs uppercase tracking-[0.11em] text-cyan-200/80">
                                                Prod. {track.producer || 'Pendiente'}
                                            </p>
                                            {track.features ? (
                                                <p className="mt-2 text-sm text-amber-100/85">Feat: {track.features}</p>
                                            ) : null}
                                        </div>
                                        <div className="pt-1 flex flex-col gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handlePlayToggle(track)}
                                                disabled={isLoading && currentTrack && currentTrack.trackNumber === track.trackNumber}
                                                className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition ${
                                                    isLoading && currentTrack && currentTrack.trackNumber === track.trackNumber
                                                        ? 'cursor-wait border border-white/20 bg-white/5 text-slate-400'
                                                        : track.audioUrl
                                                            ? 'border border-amber-300/50 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20'
                                                            : 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'
                                                }`}
                                            >
                                                {currentTrack && currentTrack.trackNumber === track.trackNumber
                                                    ? isLoading
                                                        ? 'Cargando...'
                                                        : isPlaying
                                                            ? 'Pausar'
                                                            : 'Play'
                                                    : track.audioUrl
                                                        ? 'Play'
                                                        : 'Sin audio'}
                                            </button>
                                            <a
                                                href={`/landing/track/${track.id}`}
                                                className="rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] transition border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 hover:bg-cyan-300/20 text-center"
                                            >
                                                Ver Info
                                            </a>
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
            />
        </main>
    );
}

function bootstrap() {
    const target = document.getElementById('album-landing-root');
    if (!target) return;

    const hydratedData = coerceLandingData(window.__ALBUM_LANDING_DATA__ || DEFAULT_LANDING_DATA);
    createRoot(target).render(<LandingApp data={hydratedData} />);
}

bootstrap();
