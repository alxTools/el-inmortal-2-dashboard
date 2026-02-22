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

function LandingApp({ data }) {
    const [countdown, setCountdown] = useState(() => getCountdown(data.releaseDate));
    const [filter, setFilter] = useState('all');
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [country, setCountry] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [fanStats, setFanStats] = useState({ totalLeads: 0, topCountries: [] });
    const [currentTrack, setCurrentTrack] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playError, setPlayError] = useState('');
    const audioRef = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(getCountdown(data.releaseDate));
        }, 1000 * 30);

        return () => clearInterval(timer);
    }, [data.releaseDate]);

    useEffect(() => {
        const storageKey = 'landing_el_inmortal_unlock';
        const params = new URLSearchParams(window.location.search);
        if (params.get('unlock') === '1') {
            localStorage.setItem(storageKey, '1');
            setIsUnlocked(true);
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }

        if (localStorage.getItem(storageKey) === '1') {
            setIsUnlocked(true);
        }
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
        fetchStats();
    }, [isUnlocked]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return undefined;

        const handleEnded = () => setIsPlaying(false);
        const handlePause = () => setIsPlaying(false);
        const handlePlay = () => setIsPlaying(true);
        const handleError = () => setPlayError('No se pudo reproducir el audio.');

        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('error', handleError);

        return () => {
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('play', handlePlay);
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
            setSubmitError('Debes desbloquear el area exclusiva para reproducir.');
            return;
        }
        if (!track.audioUrl) return;
        const audio = audioRef.current;
        if (!audio) return;

        const isSame = currentTrack && currentTrack.trackNumber === track.trackNumber;
        setPlayError('');

        if (isSame) {
            if (isPlaying) {
                audio.pause();
                return;
            }
            try {
                await audio.play();
            } catch (error) {
                setPlayError('No se pudo reproducir el audio.');
            }
            return;
        }

        try {
            audio.pause();
            audio.src = track.audioUrl;
            audio.currentTime = 0;
            setCurrentTrack(track);
            await audio.play();
        } catch (error) {
            setPlayError('No se pudo reproducir el audio.');
        }
    };

    const handleUnlockSubmit = async (event) => {
        event.preventDefault();
        const trimmed = email.trim().toLowerCase();
        const nameValue = fullName.trim();
        const countryValue = country.trim();
        if (!nameValue || !countryValue) {
            setSubmitError('Nombre y pais son requeridos.');
            return;
        }
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setSubmitError('Escribe un email valido.');
            return;
        }

        setIsSubmitting(true);
        setSubmitError('');

        try {
            const response = await fetch('/landing/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: trimmed,
                    full_name: nameValue,
                    country: countryValue,
                    source: 'landing_el_inmortal_2'
                })
            });

            if (!response.ok) {
                throw new Error('subscribe_failed');
            }

            localStorage.setItem('landing_el_inmortal_unlock', '1');
            setIsUnlocked(true);
        } catch (error) {
            setSubmitError('No se pudo registrar tu email. Intenta otra vez.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="relative overflow-hidden pb-20 text-slate-100">
            <div className="hero-aurora" />

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

                    <div className="mt-8 flex flex-wrap gap-3">
                        <a
                            href={data.streamingLinks.spotify || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-amber-300"
                        >
                            Escuchar en Spotify
                        </a>
                        <a
                            href={data.streamingLinks.youtubeMusic || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-cyan-300/45 bg-cyan-400/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/20"
                        >
                            Ver en YouTube Music
                        </a>
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
                    <div className="glass-panel rounded-3xl border border-amber-200/30 bg-slate-950/70 p-6 md:p-8">
                        <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Area exclusiva</p>
                        <h3 className="mt-3 font-display text-4xl text-white md:text-5xl">
                            Desbloquea el acceso anticipado
                        </h3>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                            Deja tu email para entrar a la zona privada con el tracklist completo y el player del album.
                        </p>

                        <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={handleUnlockSubmit}>
                            <input
                                type="text"
                                placeholder="Nombre y apellido"
                                value={fullName}
                                onChange={(event) => setFullName(event.target.value)}
                                className="w-full rounded-full border border-white/15 bg-slate-900/60 px-5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60"
                            />
                            <input
                                type="text"
                                placeholder="Pais"
                                value={country}
                                onChange={(event) => setCountry(event.target.value)}
                                className="w-full rounded-full border border-white/15 bg-slate-900/60 px-5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60"
                            />
                            <input
                                type="email"
                                placeholder="Tu email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className="w-full rounded-full border border-white/15 bg-slate-900/60 px-5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60"
                            />
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? 'Enviando...' : 'Desbloquear'}
                            </button>
                        </form>

                        {submitError ? (
                            <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs uppercase tracking-[0.12em] text-rose-200">
                                {submitError}
                            </div>
                        ) : null}
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
                                        <div className="pt-1">
                                            <button
                                                type="button"
                                                onClick={() => handlePlayToggle(track)}
                                                disabled={!track.audioUrl}
                                                className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition ${
                                                    track.audioUrl
                                                        ? 'border border-amber-300/50 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20'
                                                        : 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'
                                                }`}
                                            >
                                                {currentTrack && currentTrack.trackNumber === track.trackNumber && isPlaying
                                                    ? 'Pausar'
                                                    : track.audioUrl
                                                        ? 'Play'
                                                        : 'Sin audio'}
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}
            </section>

            <section className="mx-auto mt-12 w-full max-w-6xl px-6 md:px-10">
                <div className="glass-panel rounded-3xl px-6 py-8 md:px-8 md:py-10">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Campana activa</p>
                    <h3 className="mt-3 font-display text-4xl text-white md:text-5xl">
                        Contenido diario, metrica en vivo y expansion internacional
                    </h3>
                    <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                        Este landing queda conectado al dashboard para actualizar tracklist y datos de forma automatica. La
                        meta es convertir cada cancion en contenido reutilizable para YouTube, TikTok e Instagram con
                        direccion creativa consistente.
                    </p>

                    <div className="mt-6 flex flex-wrap gap-3">
                        <a
                            href={data.streamingLinks.appleMusic || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.13em] text-white transition hover:bg-white/20"
                        >
                            Apple Music
                        </a>
                        <a
                            href={data.streamingLinks.deezer || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.13em] text-white transition hover:bg-white/20"
                        >
                            Deezer
                        </a>
                        <a
                            href="/auth/login"
                            className="rounded-full border border-amber-300/50 bg-amber-300/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.13em] text-amber-100 transition hover:bg-amber-300/20"
                        >
                            Entrar al dashboard
                        </a>
                    </div>
                </div>
            </section>
            <audio ref={audioRef} preload="none" />
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
