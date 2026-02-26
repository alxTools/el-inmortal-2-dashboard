"use strict";
var AlbumLandingApp = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // frontend/landing/landing.jsx
  var import_react = __toESM(__require("react"));
  var import_client = __require("react-dom/client");
  var import_jsx_runtime = __require("react/jsx-runtime");
  function AudioWavesBackground() {
    const bars = (0, import_react.useMemo)(() => {
      return Array.from({ length: 60 }, (_, i) => ({
        id: i,
        minHeight: 10 + Math.random() * 30,
        maxHeight: 60 + Math.random() * 140,
        duration: 0.8 + Math.random() * 1.2,
        delay: Math.random() * 2
      }));
    }, []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "audio-waves-container", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "audio-waves", children: bars.map((bar) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        className: "audio-bar",
        style: {
          "--min-height": `${bar.minHeight}px`,
          "--max-height": `${bar.maxHeight}px`,
          "--duration": `${bar.duration}s`,
          "--delay": `${bar.delay}s`
        }
      },
      bar.id
    )) }) });
  }
  function FloatingParticles() {
    const particles = (0, import_react.useMemo)(() => {
      return Array.from({ length: 20 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        duration: 15 + Math.random() * 20,
        delay: Math.random() * 10,
        size: 2 + Math.random() * 4
      }));
    }, []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "particles-container", children: particles.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        className: "particle",
        style: {
          left: `${p.left}%`,
          width: `${p.size}px`,
          height: `${p.size}px`,
          "--duration": `${p.duration}s`,
          animationDelay: `${p.delay}s`
        }
      },
      p.id
    )) });
  }
  function Cover3D({ src, alt }) {
    const coverRef = (0, import_react.useRef)(null);
    const handleMouseMove = (0, import_react.useCallback)((e) => {
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
    const handleMouseLeave = (0, import_react.useCallback)(() => {
      const cover = coverRef.current;
      if (cover) {
        cover.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
      }
    }, []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "cover-3d-container", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        ref: coverRef,
        className: "cover-3d",
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src, alt })
      }
    ) });
  }
  function TypingText({ text, className = "" }) {
    const [displayText, setDisplayText] = (0, import_react.useState)("");
    const [showCursor, setShowCursor] = (0, import_react.useState)(true);
    (0, import_react.useEffect)(() => {
      let index = 0;
      const timer = setInterval(() => {
        if (index < text.length) {
          setDisplayText(text.slice(0, index + 1));
          index++;
        } else {
          clearInterval(timer);
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
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className, children: [
      displayText,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: showCursor ? 1 : 0, color: "#facc15" }, children: "|" })
    ] });
  }
  function ScrollIndicator() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "scroll-indicator", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Scroll" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 5v14M5 12l7 7 7-7" }) })
    ] });
  }
  var DEFAULT_LANDING_DATA = {
    albumName: "El Inmortal 2",
    artistName: "Galante el Emperador",
    releaseDate: "2026-02-17T00:00:00.000Z",
    description: "Un regreso con 21 temas que mezclan reggaeton clasico, narrativa calle y colaboraciones estrategicas para dominar playlists y UGC.",
    coverImage: "/uploads/images/el_inmortal_2_cover_1771220102312.png",
    tracks: [],
    stats: {
      totalTracks: 21,
      collaborators: 0,
      featuredTracks: 0
    },
    streamingLinks: {
      spotify: "",
      appleMusic: "",
      youtubeMusic: "",
      deezer: ""
    }
  };
  function coerceLandingData(raw) {
    if (!raw || typeof raw !== "object") return DEFAULT_LANDING_DATA;
    const tracks = Array.isArray(raw.tracks) ? raw.tracks.map((track) => ({
      id: track.id || null,
      trackNumber: Number(track.trackNumber || 0),
      title: String(track.title || "").trim(),
      producer: String(track.producer || "").trim(),
      features: String(track.features || "").trim(),
      duration: String(track.duration || "").trim(),
      audioUrl: String(track.audioUrl || "").trim()
    })) : [];
    return {
      ...DEFAULT_LANDING_DATA,
      ...raw,
      tracks,
      stats: {
        ...DEFAULT_LANDING_DATA.stats,
        ...raw.stats || {}
      },
      streamingLinks: {
        ...DEFAULT_LANDING_DATA.streamingLinks,
        ...raw.streamingLinks || {}
      }
    };
  }
  function formatLaunchDate(dateText) {
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return dateText;
    return new Intl.DateTimeFormat("es-PR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }
  function getCountdown(releaseDateText) {
    const now = Date.now();
    const release = new Date(releaseDateText).getTime();
    const diff = Math.max(0, release - now);
    return {
      days: Math.floor(diff / (1e3 * 60 * 60 * 24)),
      hours: Math.floor(diff / (1e3 * 60 * 60) % 24),
      minutes: Math.floor(diff / (1e3 * 60) % 60),
      launched: diff <= 0
    };
  }
  function formatTrackNumber(value) {
    return String(value || 0).padStart(2, "0");
  }
  function SubscribeModal({ isOpen, onClose, onSubmit, isSubmitting, error, detectedCountry }) {
    const [email, setEmail] = (0, import_react.useState)("");
    const [fullName, setFullName] = (0, import_react.useState)("");
    const [country, setCountry] = (0, import_react.useState)(detectedCountry || "");
    const [acceptEmails, setAcceptEmails] = (0, import_react.useState)(true);
    (0, import_react.useEffect)(() => {
      if (detectedCountry && !country) {
        setCountry(detectedCountry);
      }
    }, [detectedCountry]);
    if (!isOpen) return null;
    const handleSubmit = (e) => {
      e.preventDefault();
      onSubmit({ email, fullName, country });
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "modal-overlay", onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "modal-content", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "modal-close", onClick: onClose, children: "\xD7" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "modal-header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "modal-icon", children: "\u{1F3B5}" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "modal-title", children: "Desbloquea el \xC1lbum Completo" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "modal-subtitle", children: 'S\xE9 el primero en escuchar "El Inmortal 2" antes que nadie' })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "modal-benefits", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "benefit-item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "benefit-icon", children: "\u{1F3A7}" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Escucha todas las 21 canciones" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "benefit-item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "benefit-icon", children: "\u{1F4F1}" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Acceso exclusivo al reproductor" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "benefit-item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "benefit-icon", children: "\u{1F381}" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Contenido exclusivo y noticias" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { onSubmit: handleSubmit, className: "modal-form", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "form-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "modal-name", children: "Nombre completo *" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              id: "modal-name",
              type: "text",
              placeholder: "Tu nombre",
              value: fullName,
              onChange: (e) => setFullName(e.target.value),
              required: true,
              autoFocus: true
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "form-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "modal-email", children: "Email *" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              id: "modal-email",
              type: "email",
              placeholder: "tu@email.com",
              value: email,
              onChange: (e) => setEmail(e.target.value),
              required: true
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "form-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "modal-country", children: "Pa\xEDs *" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              id: "modal-country",
              type: "text",
              placeholder: "Tu pa\xEDs",
              value: country,
              onChange: (e) => setCountry(e.target.value),
              required: true
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { className: "form-hint", children: "Detectado autom\xE1ticamente, puedes cambiarlo" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "form-checkbox", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              id: "accept-emails",
              checked: acceptEmails,
              onChange: (e) => setAcceptEmails(e.target.checked)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "accept-emails", children: "Acepto recibir emails con noticias, lanzamientos y contenido exclusivo de Galante el Emperador" })
        ] }),
        error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "modal-error", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "error-icon", children: "\u26A0\uFE0F" }),
          error
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "submit",
            className: "modal-submit-btn",
            disabled: isSubmitting || !acceptEmails,
            children: isSubmitting ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "spinner" }),
              "Procesando..."
            ] }) : "\u{1F513} Desbloquear Acceso Ahora"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "modal-footer", children: "\u{1F512} Tu informaci\xF3n est\xE1 segura. Nunca compartimos tus datos." })
    ] }) });
  }
  function CartModal({ isOpen, onClose, cartItems, setCartItems, isCheckingOut, setIsCheckingOut }) {
    const [selectedPackage, setSelectedPackage] = (0, import_react.useState)(null);
    const packages = [
      {
        id: "digital",
        name: "\xC1lbum Digital",
        description: "Acceso completo al \xE1lbum El Inmortal 2 (21 tracks)",
        price: 0,
        icon: "\u{1F3B5}",
        included: true
      },
      {
        id: "cd",
        name: "Mini-Disc Firmado",
        description: "Edici\xF3n f\xEDsica limitada con firma de Galante. Incluye env\xEDo.",
        price: 15,
        icon: "\u{1F4BF}",
        bonus: "Incluye sticker exclusivo"
      },
      {
        id: "cd-video",
        name: "Mini-Disc + Video Saludo",
        description: "Mini-Disc firmado + Video saludo personalizado de Galante (entrega 1 semana antes)",
        price: 25,
        icon: "\u{1F381}",
        bonus: "Video saludo exclusivo + Sticker + Acceso VIP"
      }
    ];
    const addToCart = (pkg) => {
      if (pkg.id === "digital") return;
      const existing = cartItems.find((item) => item.id === pkg.id);
      if (existing) {
        return;
      }
      setCartItems([...cartItems, pkg]);
      setSelectedPackage(pkg.id);
    };
    const removeFromCart = (pkgId) => {
      setCartItems(cartItems.filter((item) => item.id !== pkgId));
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
      localStorage.setItem("ei2_cart", JSON.stringify(cartItems));
      setTimeout(() => {
        setIsCheckingOut(false);
        const hasRegistered = localStorage.getItem("ei2_registered");
        if (hasRegistered) {
          const userEmail = localStorage.getItem("ei2_email");
          if (userEmail) {
            window.location.href = `/landing/checkout?email=${encodeURIComponent(userEmail)}&token=demo`;
          } else {
            alert("Por favor reg\xEDstrate primero para completar tu compra");
          }
        } else {
          onClose();
          setTimeout(() => {
            if (window.openSubscribeModal) {
              window.openSubscribeModal();
            } else {
              alert("Por favor reg\xEDstrate primero para acceder al checkout seguro");
            }
          }, 100);
        }
      }, 500);
    };
    if (!isOpen) return null;
    const cartStyles = {
      overlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px"
      },
      modal: {
        background: "linear-gradient(145deg, #0f172a 0%, #1e293b 100%)",
        borderRadius: "24px",
        border: "1px solid rgba(250,204,21,0.3)",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 40px rgba(250,204,21,0.1)",
        maxWidth: "500px",
        width: "100%",
        maxHeight: "90vh",
        overflow: "auto",
        position: "relative"
      },
      header: {
        padding: "32px 24px 20px",
        textAlign: "center",
        borderBottom: "1px solid rgba(250,204,21,0.2)"
      },
      icon: {
        fontSize: "48px",
        marginBottom: "12px"
      },
      title: {
        fontSize: "28px",
        fontWeight: 800,
        color: "#facc15",
        marginBottom: "8px",
        letterSpacing: "0.05em"
      },
      subtitle: {
        color: "#94a3b8",
        fontSize: "14px"
      },
      packages: {
        padding: "24px"
      },
      packageCard: {
        background: "rgba(30,41,59,0.6)",
        borderRadius: "16px",
        padding: "20px",
        marginBottom: "16px",
        border: "2px solid transparent",
        cursor: "pointer",
        transition: "all 0.3s ease",
        display: "flex",
        alignItems: "flex-start",
        gap: "16px",
        position: "relative",
        overflow: "hidden"
      },
      packageCardSelected: {
        borderColor: "#facc15",
        background: "rgba(250,204,21,0.1)",
        boxShadow: "0 0 20px rgba(250,204,21,0.2)"
      },
      packageCardIncluded: {
        opacity: 0.8,
        cursor: "default"
      },
      packageIcon: {
        fontSize: "36px",
        flexShrink: 0
      },
      packageInfo: {
        flex: 1
      },
      packageName: {
        fontSize: "18px",
        fontWeight: 700,
        color: "#f1f5f9",
        marginBottom: "6px",
        display: "flex",
        alignItems: "center",
        gap: "8px"
      },
      badgeFree: {
        background: "#22c55e",
        color: "white",
        fontSize: "10px",
        padding: "2px 8px",
        borderRadius: "999px",
        fontWeight: 700
      },
      packageDesc: {
        color: "#94a3b8",
        fontSize: "13px",
        lineHeight: 1.5,
        marginBottom: "6px"
      },
      packageBonus: {
        color: "#facc15",
        fontSize: "12px",
        fontWeight: 600
      },
      packagePrice: {
        textAlign: "right",
        minWidth: "80px"
      },
      priceFree: {
        color: "#22c55e",
        fontWeight: 700,
        fontSize: "20px"
      },
      priceAmount: {
        color: "#facc15",
        fontWeight: 800,
        fontSize: "24px"
      },
      btnAdd: {
        background: "linear-gradient(135deg, #facc15, #fbbf24)",
        color: "#0f172a",
        border: "none",
        padding: "8px 16px",
        borderRadius: "8px",
        fontWeight: 700,
        fontSize: "12px",
        cursor: "pointer",
        marginTop: "8px",
        transition: "transform 0.2s"
      },
      btnRemove: {
        background: "#ef4444",
        color: "white",
        border: "none",
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        fontWeight: 700,
        cursor: "pointer",
        marginTop: "8px"
      },
      summary: {
        padding: "24px",
        borderTop: "1px solid rgba(250,204,21,0.2)",
        background: "rgba(0,0,0,0.2)"
      },
      total: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "16px",
        fontSize: "20px"
      },
      totalAmount: {
        color: "#facc15",
        fontWeight: 800,
        fontSize: "32px"
      },
      checkoutBtn: {
        width: "100%",
        background: "linear-gradient(135deg, #facc15, #fbbf24)",
        color: "#0f172a",
        border: "none",
        padding: "16px 24px",
        borderRadius: "12px",
        fontWeight: 800,
        fontSize: "16px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        boxShadow: "0 10px 25px rgba(250,204,21,0.3)",
        transition: "transform 0.2s"
      },
      footer: {
        padding: "16px 24px",
        textAlign: "center",
        color: "#64748b",
        fontSize: "12px",
        borderTop: "1px solid rgba(255,255,255,0.1)"
      },
      closeBtn: {
        position: "absolute",
        top: "16px",
        right: "16px",
        background: "rgba(255,255,255,0.1)",
        border: "none",
        color: "#94a3b8",
        width: "36px",
        height: "36px",
        borderRadius: "50%",
        fontSize: "24px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s"
      },
      popularBadge: {
        position: "absolute",
        top: "12px",
        right: "12px",
        background: "linear-gradient(135deg, #facc15, #fbbf24)",
        color: "#0f172a",
        fontSize: "10px",
        fontWeight: 800,
        padding: "4px 12px",
        borderRadius: "999px",
        textTransform: "uppercase",
        letterSpacing: "0.05em"
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: cartStyles.overlay, onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: cartStyles.modal, onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: cartStyles.closeBtn, onClick: onClose, children: "\xD7" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: cartStyles.header, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: cartStyles.icon, children: "\u{1F6D2}" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: cartStyles.title, children: "Carrito VIP" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: cartStyles.subtitle, children: [
          "\u{1F3B5} \xC1lbum Digital: ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { color: "#22c55e" }, children: "GRATIS" }),
          " (ya incluido)"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: cartStyles.packages, children: packages.map((pkg) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          style: {
            ...cartStyles.packageCard,
            ...pkg.included ? cartStyles.packageCardIncluded : {},
            ...cartItems.find((item) => item.id === pkg.id) || selectedPackage === pkg.id ? cartStyles.packageCardSelected : {}
          },
          onClick: () => !pkg.included && addToCart(pkg),
          children: [
            pkg.id === "cd-video" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: cartStyles.popularBadge, children: "M\xE1s Popular" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: cartStyles.packageIcon, children: pkg.icon }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: cartStyles.packageInfo, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { style: cartStyles.packageName, children: [
                pkg.name,
                pkg.included && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: cartStyles.badgeFree, children: "GRATIS" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: cartStyles.packageDesc, children: pkg.description }),
              pkg.bonus && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: cartStyles.packageBonus, children: [
                "\u2728 ",
                pkg.bonus
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: cartStyles.packagePrice, children: pkg.price === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: cartStyles.priceFree, children: "$0" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: cartStyles.priceAmount, children: [
                "$",
                pkg.price
              ] }),
              cartItems.find((item) => item.id === pkg.id) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  style: cartStyles.btnRemove,
                  onClick: (e) => {
                    e.stopPropagation();
                    removeFromCart(pkg.id);
                  },
                  onMouseEnter: (e) => e.target.style.transform = "scale(1.1)",
                  onMouseLeave: (e) => e.target.style.transform = "scale(1)",
                  children: "\u2715"
                }
              ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  style: cartStyles.btnAdd,
                  onMouseEnter: (e) => e.target.style.transform = "translateY(-2px)",
                  onMouseLeave: (e) => e.target.style.transform = "translateY(0)",
                  children: "Agregar"
                }
              )
            ] }) })
          ]
        },
        pkg.id
      )) }),
      cartItems.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: cartStyles.summary, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: cartStyles.total, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#94a3b8" }, children: "Total:" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: cartStyles.totalAmount, children: [
            "$",
            getTotal()
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            style: {
              ...cartStyles.checkoutBtn,
              opacity: isCheckingOut ? 0.7 : 1,
              cursor: isCheckingOut ? "not-allowed" : "pointer"
            },
            onClick: handleCheckout,
            disabled: isCheckingOut,
            onMouseEnter: (e) => !isCheckingOut && (e.target.style.transform = "translateY(-2px)"),
            onMouseLeave: (e) => !isCheckingOut && (e.target.style.transform = "translateY(0)"),
            children: isCheckingOut ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: {
                width: "20px",
                height: "20px",
                border: "3px solid rgba(15,23,42,0.3)",
                borderTopColor: "#0f172a",
                borderRadius: "50%",
                animation: "spin 1s linear infinite"
              } }),
              "Procesando..."
            ] }) : "\u{1F4B3} Ir a Checkout Seguro"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: cartStyles.footer, children: "\u{1F512} Pago seguro procesado por Stripe. Entrega en 7-14 d\xEDas." })
    ] }) });
  }
  function LandingApp({ data }) {
    const [countdown, setCountdown] = (0, import_react.useState)(() => getCountdown(data.releaseDate));
    const [filter, setFilter] = (0, import_react.useState)("all");
    const [isUnlocked, setIsUnlocked] = (0, import_react.useState)(false);
    const [isModalOpen, setIsModalOpen] = (0, import_react.useState)(false);
    const [isSubmitting, setIsSubmitting] = (0, import_react.useState)(false);
    const [submitError, setSubmitError] = (0, import_react.useState)("");
    const [detectedCountry, setDetectedCountry] = (0, import_react.useState)("");
    const [fanStats, setFanStats] = (0, import_react.useState)({ totalLeads: 0, topCountries: [] });
    const [currentTrack, setCurrentTrack] = (0, import_react.useState)(null);
    const [isPlaying, setIsPlaying] = (0, import_react.useState)(false);
    const [isLoading, setIsLoading] = (0, import_react.useState)(false);
    const [playError, setPlayError] = (0, import_react.useState)("");
    const [audioReady, setAudioReady] = (0, import_react.useState)(false);
    const audioRef = (0, import_react.useRef)(null);
    const [showCartModal, setShowCartModal] = (0, import_react.useState)(false);
    const [cartItems, setCartItems] = (0, import_react.useState)([]);
    const [isCheckingOut, setIsCheckingOut] = (0, import_react.useState)(false);
    (0, import_react.useEffect)(() => {
      const detectCountry = async () => {
        try {
          const userLang = navigator.language || navigator.userLanguage;
          const langCountry = userLang.split("-")[1];
          if (langCountry) {
            setDetectedCountry(langCountry);
            return;
          }
          const response = await fetch("https://ipapi.co/json/", {
            signal: AbortSignal.timeout(5e3)
          });
          if (response.ok) {
            const data2 = await response.json();
            if (data2.country_name) {
              setDetectedCountry(data2.country_name);
            }
          }
        } catch (error) {
          console.log("No se pudo detectar pa\xEDs:", error);
        }
      };
      detectCountry();
    }, []);
    (0, import_react.useEffect)(() => {
      const disableContextMenu = (e) => {
        e.preventDefault();
        return false;
      };
      const disableKeyboardShortcuts = (e) => {
        if (e.key === "F12") {
          e.preventDefault();
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === "I") {
          e.preventDefault();
          return false;
        }
        if (e.ctrlKey && e.key === "s") {
          e.preventDefault();
          return false;
        }
        if (e.ctrlKey && e.key === "u") {
          e.preventDefault();
          return false;
        }
      };
      document.addEventListener("contextmenu", disableContextMenu);
      document.addEventListener("keydown", disableKeyboardShortcuts);
      return () => {
        document.removeEventListener("contextmenu", disableContextMenu);
        document.removeEventListener("keydown", disableKeyboardShortcuts);
      };
    }, []);
    (0, import_react.useEffect)(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const shouldUnlock = urlParams.get("unlock") === "1" || urlParams.get("verified") === "1";
      if (shouldUnlock) {
        setIsUnlocked(true);
        localStorage.setItem("landing_el_inmortal_unlock", "1");
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        const storedUnlock = localStorage.getItem("landing_el_inmortal_unlock");
        if (storedUnlock === "1") {
          setIsUnlocked(true);
        } else {
          const timer = setTimeout(() => {
            setIsModalOpen(true);
          }, 2e3);
          return () => clearTimeout(timer);
        }
      }
    }, []);
    (0, import_react.useEffect)(() => {
      const timer = setInterval(() => {
        setCountdown(getCountdown(data.releaseDate));
      }, 1e3 * 30);
      return () => clearInterval(timer);
    }, [data.releaseDate]);
    (0, import_react.useEffect)(() => {
      window.openSubscribeModal = () => {
        setIsModalOpen(true);
      };
      return () => {
        delete window.openSubscribeModal;
      };
    }, []);
    (0, import_react.useEffect)(() => {
      if (!isUnlocked) return;
      const fetchStats = async () => {
        try {
          const response = await fetch("/landing/stats");
          if (!response.ok) return;
          const payload = await response.json();
          setFanStats({
            totalLeads: payload.totalLeads || 0,
            topCountries: Array.isArray(payload.topCountries) ? payload.topCountries : []
          });
        } catch (error) {
          console.error("Stats fetch error", error);
        }
      };
      fetchStats();
    }, [isUnlocked]);
    (0, import_react.useEffect)(() => {
      const audio = audioRef.current;
      if (!audio) return void 0;
      const handleEnded = () => {
        setIsPlaying(false);
        setIsLoading(false);
        playNextTrack();
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
        console.error("[Audio Error]", e);
        setPlayError("Error al cargar el audio. Verifica tu conexi\xF3n.");
        setIsPlaying(false);
        setIsLoading(false);
        setAudioReady(false);
      };
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("play", handlePlay);
      audio.addEventListener("canplay", handleCanPlay);
      audio.addEventListener("loadstart", handleLoadStart);
      audio.addEventListener("waiting", handleWaiting);
      audio.addEventListener("error", handleError);
      return () => {
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("canplay", handleCanPlay);
        audio.removeEventListener("loadstart", handleLoadStart);
        audio.removeEventListener("waiting", handleWaiting);
        audio.removeEventListener("error", handleError);
      };
    }, []);
    const releaseDateLabel = (0, import_react.useMemo)(() => formatLaunchDate(data.releaseDate), [data.releaseDate]);
    const filteredTracks = (0, import_react.useMemo)(() => {
      if (filter === "featured") {
        return data.tracks.filter((track) => track.features);
      }
      if (filter === "core") {
        return data.tracks.filter((track) => !track.features);
      }
      return data.tracks;
    }, [filter, data.tracks]);
    const cards = [
      {
        label: "Tracks",
        value: data.stats.totalTracks || data.tracks.length || 21,
        detail: "disenados para playlist y campa\xF1a"
      },
      {
        label: "Colaboradores",
        value: data.stats.collaborators || 0,
        detail: "productores, feats y creative crew"
      },
      {
        label: "Con feats",
        value: data.stats.featuredTracks || data.tracks.filter((track) => track.features).length,
        detail: "momentos clave para contenido viral"
      }
    ];
    const handlePlayToggle = async (track) => {
      if (!isUnlocked) {
        setIsModalOpen(true);
        return;
      }
      if (!track.audioUrl) {
        setPlayError("Audio no disponible para este track.");
        return;
      }
      const audio = audioRef.current;
      if (!audio) {
        setPlayError("Error del reproductor. Recarga la p\xE1gina.");
        return;
      }
      const isSame = currentTrack && currentTrack.trackNumber === track.trackNumber;
      setPlayError("");
      if (isSame && isPlaying) {
        document.dispatchEvent(new CustomEvent("audio-paused"));
      } else {
        document.dispatchEvent(new CustomEvent("audio-playing"));
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
          console.error("[Audio Play Error]", error);
          setIsLoading(false);
          if (error.name === "NotAllowedError") {
            setPlayError("Haz clic nuevamente para reproducir el audio.");
          } else {
            setPlayError("No se pudo reproducir el audio.");
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
        console.error("[Audio Load Error]", error);
        setIsLoading(false);
        if (error.name === "NotAllowedError") {
          setPlayError("Interacci\xF3n requerida. Toca el bot\xF3n de nuevo.");
        } else if (error.name === "NotSupportedError") {
          setPlayError("Formato de audio no soportado en este dispositivo.");
        } else {
          setPlayError("No se pudo reproducir el audio.");
        }
      }
    };
    const handleListenNow = async () => {
      if (!isUnlocked) {
        setIsModalOpen(true);
        return;
      }
      const track1 = data.tracks.find((t) => t.trackNumber === 1);
      if (track1 && track1.audioUrl) {
        await handlePlayToggle(track1);
        document.getElementById("tracklist")?.scrollIntoView({ behavior: "smooth" });
      } else {
        setPlayError("Track 1 no disponible.");
      }
    };
    const playNextTrack = () => {
      if (!currentTrack || !data.tracks.length) return;
      const currentIndex = data.tracks.findIndex((t) => t.trackNumber === currentTrack.trackNumber);
      if (currentIndex >= 0 && currentIndex < data.tracks.length - 1) {
        const nextTrack = data.tracks[currentIndex + 1];
        if (nextTrack && nextTrack.audioUrl) {
          handlePlayToggle(nextTrack);
        }
      }
    };
    const handleUnlockSubmit = async ({ email, fullName, country }) => {
      setIsSubmitting(true);
      setSubmitError("");
      try {
        console.log("[Landing] Enviando suscripci\xF3n...", { email, fullName, country });
        const response = await fetch("/landing/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            email,
            full_name: fullName,
            country,
            source: "landing_el_inmortal_2"
          })
        });
        console.log("[Landing] Respuesta:", response.status);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "unknown" }));
          console.error("[Landing] Error del servidor:", errorData);
          if (errorData.error === "missing_fields") {
            throw new Error("Faltan campos requeridos.");
          } else if (errorData.error === "email_invalid") {
            throw new Error("El email no es v\xE1lido.");
          } else if (errorData.error === "server_error") {
            throw new Error("Error del servidor. Por favor intenta m\xE1s tarde.");
          } else {
            throw new Error("No se pudo completar el registro.");
          }
        }
        const data2 = await response.json();
        console.log("[Landing] \xC9xito:", data2);
        localStorage.setItem("landing_el_inmortal_unlock", "1");
        localStorage.setItem("ei2_registered", "true");
        localStorage.setItem("ei2_email", email);
        localStorage.setItem("ei2_name", fullName);
        setIsUnlocked(true);
        setIsModalOpen(false);
        setSubmitError("");
        setTimeout(() => {
          setShowCartModal(true);
        }, 1e3);
      } catch (error) {
        console.error("[Landing] Error:", error);
        setSubmitError(error.message || "No se pudo registrar tu email. Intenta otra vez.");
      } finally {
        setIsSubmitting(false);
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", { className: "relative overflow-hidden text-slate-100", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudioWavesBackground, {}),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FloatingParticles, {}),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hero-aurora" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        SubscribeModal,
        {
          isOpen: isModalOpen,
          onClose: () => setIsModalOpen(false),
          onSubmit: handleUnlockSubmit,
          isSubmitting,
          error: submitError,
          detectedCountry
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        CartModal,
        {
          isOpen: showCartModal,
          onClose: () => setShowCartModal(false),
          cartItems,
          setCartItems,
          isCheckingOut,
          setIsCheckingOut
        }
      ),
      !isUnlocked && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          className: "floating-unlock-btn",
          onClick: () => setIsModalOpen(true),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "unlock-icon", children: "\u{1F513}" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "unlock-text", children: "Desbloquear \xC1lbum" })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "hero-fullscreen", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "reveal mb-6", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-300/10 px-5 py-2 text-xs uppercase tracking-[0.25em] text-amber-200 backdrop-blur-sm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" }),
          "Nuevo Album Oficial"
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "h1",
          {
            className: "font-display text-6xl leading-[0.9] text-white md:text-8xl lg:text-9xl glitch-text reveal reveal-delay-1",
            "data-text": data.albumName,
            children: data.albumName
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mt-4 text-lg font-medium uppercase tracking-[0.25em] text-cyan-300 md:text-xl reveal reveal-delay-2", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TypingText, { text: data.artistName }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-10 reveal reveal-delay-2", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Cover3D,
          {
            src: data.coverImage,
            alt: `${data.albumName} cover art`
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mt-10 flex flex-wrap items-center justify-center gap-8 md:gap-12 reveal reveal-delay-3", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-center", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "stat-number", children: data.stats.totalTracks || 21 }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs uppercase tracking-[0.2em] text-slate-400", children: "Tracks" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-12 w-px bg-gradient-to-b from-transparent via-slate-600 to-transparent" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-center", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "stat-number", children: data.stats.collaborators || 24 }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs uppercase tracking-[0.2em] text-slate-400", children: "Colaboradores" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-12 w-px bg-gradient-to-b from-transparent via-slate-600 to-transparent" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-center", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "stat-number", children: data.stats.featuredTracks || 11 }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs uppercase tracking-[0.2em] text-slate-400", children: "Featurings" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mt-10 flex flex-wrap items-center justify-center gap-4 reveal reveal-delay-3", children: [
          !isUnlocked ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              onClick: () => setIsModalOpen(true),
              className: "btn-neon",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u{1F513}" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Desbloquear \xC1lbum" })
              ]
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", { href: "#tracklist", className: "btn-neon", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u{1F3B5}" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Ver Tracklist" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              onClick: handleListenNow,
              className: "btn-neon btn-neon-cyan",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u25B6" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Escuchar Ahora" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-8 glass-panel-enhanced px-6 py-4 reveal reveal-delay-3", children: countdown.launched ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "text-sm font-semibold text-emerald-400", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mr-2", children: "\u2713" }),
          "Ya disponible en todas las plataformas"
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "text-sm text-slate-300", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-500 mr-2", children: "Lanzamiento:" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "font-semibold text-white", children: releaseDateLabel }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mx-3 text-slate-600", children: "|" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "font-semibold text-amber-300", children: [
            countdown.days,
            "d"
          ] }),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "font-semibold text-cyan-300", children: [
            countdown.hours,
            "h"
          ] }),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "font-semibold text-slate-300", children: [
            countdown.minutes,
            "m"
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollIndicator, {})
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { id: "streaming", className: "relative z-10 py-16 px-6", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mx-auto max-w-4xl text-center", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "font-display text-3xl text-white md:text-4xl mb-8 reveal", children: "Escucha en tu plataforma favorita" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-wrap items-center justify-center gap-4 reveal reveal-delay-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: data.streamingLinks.spotify || "#", className: "streaming-btn bg-[#1DB954]", title: "Spotify", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-7 w-7", fill: "white", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: data.streamingLinks.youtubeMusic || "#", className: "streaming-btn bg-[#FF0000]", title: "YouTube Music", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-7 w-7", fill: "white", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228 18.228 15.432 18.228 12 15.432 5.772 12 5.772zM9.684 15.852V8.148L15.816 12l-6.132 3.852z" }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: data.streamingLinks.appleMusic || "#", className: "streaming-btn bg-[#FA243C]", title: "Apple Music", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-7 w-7", fill: "white", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.214.265-1.333.272-2.397.918-3.062 2.065a4.845 4.845 0 00-.676 1.992 9.51 9.51 0 00-.099 1.114c-.004.064-.01.13-.01.195v8.16c.01.12.017.242.024.363.04.718.106 1.435.238 2.144.24 1.27.793 2.273 1.805 3.02.913.672 1.955 1.012 3.082 1.147.737.09 1.48.153 2.22.177.18.01.363.014.543.014h11.19c.065-.003.133-.01.195-.012.798-.024 1.596-.086 2.385-.208 1.21-.19 2.235-.666 3.026-1.505.684-.726 1.078-1.59 1.23-2.59.06-.417.093-.84.108-1.265.01-.134.02-.269.02-.404V6.514c0-.135-.01-.269-.02-.39zm-6.5 6.044l-4.6 3.24c-.24.17-.54.186-.78.04-.06-.04-.11-.09-.15-.146V7.4c.02-.06.06-.12.1-.17.16-.16.4-.19.6-.08l4.59 3.23c.04.03.07.07.1.11.12.2.12.44-.02.64-.04.04-.08.08-.13.11l.19.14z" }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: data.streamingLinks.deezer || "#", className: "streaming-btn bg-[#A238FF]", title: "Deezer", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-7 w-7", fill: "white", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm4.8 16.8h-2.4v-4.8H12v4.8H9.6v-4.8H7.2v4.8H4.8V7.2h2.4v4.8h2.4V7.2H12v4.8h2.4V7.2h2.4v9.6z" }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: data.streamingLinks.amazonMusic || "#", className: "streaming-btn bg-[#00A8E1]", title: "Amazon Music", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-7 w-7", fill: "white", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.582l.315-.118c.138-.053.209-.053.276 0 .053.043.072.115.043.206-.138.548-.206.986-.206 1.314 0 1.507 1.186 2.666 2.68 2.666.434 0 .872-.108 1.308-.339.051-.023.107-.023.152 0 .044.021.067.064.067.118 0 .06-.024.098-.067.126-1.13.77-2.41 1.206-3.79 1.206-1.45 0-2.76-.47-3.93-1.41-.39-.32-.8-.53-1.23-.64-.43-.11-.84-.05-1.24.17-2.27 1.35-4.79 2.02-7.56 2.02-2.4 0-4.65-.5-6.75-1.51-.55-.26-.93-.35-1.14-.26-.21.09-.33.3-.38.64-.05.34-.18.6-.38.8-.2.2-.5.3-.9.3-.76 0-1.39-.27-1.88-.82-.5-.55-.75-1.22-.75-2.03 0-.57.14-1.18.41-1.83.27-.65.66-1.29 1.15-1.93z" }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: data.streamingLinks.tidal || "#", className: "streaming-btn bg-black border border-white/20", title: "Tidal", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-6 w-6", fill: "white", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12.012 0L6.555 5.447l5.457 5.454L6.555 16.35l5.457 5.454 5.463-5.454-5.463-5.449 5.463-5.454L12.012 0zm5.463 5.447l-5.463 5.454 5.463 5.449-5.457 5.454L6.555 16.35l5.463-5.454-5.463-5.449L12.018 0l5.457 5.447z" }) }) })
        ] })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { id: "tracklist", className: "relative z-10 mx-auto mt-10 w-full max-w-6xl px-6 pb-20 md:px-10", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mb-6 flex flex-wrap items-center justify-between gap-4", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", { className: "font-display text-4xl text-white md:text-5xl", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-amber-400", children: "#" }),
            " Tracklist"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-wrap gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                onClick: () => setFilter("all"),
                className: `rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${filter === "all" ? "bg-amber-300 text-slate-900" : "border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"}`,
                children: "Todos"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                onClick: () => setFilter("featured"),
                className: `rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${filter === "featured" ? "bg-amber-300 text-slate-900" : "border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"}`,
                children: "Featurings"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                onClick: () => setFilter("core"),
                className: `rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${filter === "core" ? "bg-amber-300 text-slate-900" : "border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"}`,
                children: "Solo Galante"
              }
            )
          ] })
        ] }),
        !isUnlocked ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "tracklist-locked glass-panel-enhanced rounded-3xl border border-amber-300/20 p-10 md:p-16 text-center relative overflow-hidden", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-cyan-500/5 pointer-events-none" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "relative z-10", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "locked-icon text-7xl mb-4 animate-pulse", children: "\u{1F512}" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "font-display text-4xl text-white md:text-5xl", children: [
              "Tracklist ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-amber-400", children: "Bloqueado" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "mt-4 max-w-lg mx-auto text-base leading-7 text-slate-300", children: [
              "Reg\xEDstrate con tu email para desbloquear el tracklist completo y escuchar todas las ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-amber-300 font-semibold", children: "21 canciones" }),
              " antes que nadie."
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                onClick: () => setIsModalOpen(true),
                className: "btn-neon mt-8",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u{1F513}" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Desbloquear Ahora" })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "mt-6 text-sm text-slate-400", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-amber-400 font-semibold", children: [
                "+",
                fanStats.totalLeads || "1,247"
              ] }),
              " fans ya se han registrado"
            ] })
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          currentTrack ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mb-4 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-200", children: [
            "Reproduciendo: ",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "font-semibold text-white", children: currentTrack.title })
          ] }) : null,
          playError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs uppercase tracking-[0.12em] text-rose-200", children: playError }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mb-5 grid gap-3 md:grid-cols-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "glass-panel rounded-2xl p-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs uppercase tracking-[0.2em] text-slate-300", children: "Descargas por pais" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mt-2 text-3xl font-semibold text-white", children: fanStats.totalLeads }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mt-2 text-xs uppercase tracking-[0.12em] text-slate-400", children: "Registros totales" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "glass-panel rounded-2xl p-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs uppercase tracking-[0.2em] text-slate-300", children: "Top paises" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-3 space-y-2 text-sm text-slate-200", children: fanStats.topCountries.length ? fanStats.topCountries.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center justify-between", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.country }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-amber-300", children: item.total })
              ] }, item.country)) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-slate-400", children: "Sin datos aun." }) })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "grid gap-4 md:grid-cols-2", children: filteredTracks.map((track) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "article",
            {
              className: "track-card glass-panel-enhanced rounded-2xl p-5 group",
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-start gap-4", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "font-display text-4xl leading-none bg-gradient-to-br from-amber-300 to-amber-500 bg-clip-text text-transparent group-hover:from-amber-200 group-hover:to-amber-400 transition-all", children: formatTrackNumber(track.trackNumber) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex-1 min-w-0", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-base font-semibold text-white truncate group-hover:text-amber-100 transition-colors", children: track.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "mt-1 text-xs uppercase tracking-[0.11em] text-cyan-300/80", children: [
                    "Prod. ",
                    track.producer || "Pendiente"
                  ] }),
                  track.features ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "mt-2 text-sm text-amber-200/90 flex items-center gap-2", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-xs bg-amber-500/20 px-2 py-0.5 rounded-full", children: "FEAT" }),
                    track.features
                  ] }) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pt-1 flex flex-col gap-2 shrink-0", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      type: "button",
                      onClick: () => handlePlayToggle(track),
                      disabled: isLoading && currentTrack && currentTrack.trackNumber === track.trackNumber,
                      className: `rounded-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${isLoading && currentTrack && currentTrack.trackNumber === track.trackNumber ? "cursor-wait border border-white/20 bg-white/5 text-slate-400" : currentTrack && currentTrack.trackNumber === track.trackNumber && isPlaying ? "border-2 border-emerald-400 bg-emerald-400/20 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.3)]" : track.audioUrl ? "border border-amber-400 bg-amber-400 text-slate-900 font-extrabold hover:bg-amber-300 hover:border-amber-300 hover:shadow-[0_0_20px_rgba(251,191,36,0.4)]" : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-500"}`,
                      children: currentTrack && currentTrack.trackNumber === track.trackNumber ? isLoading ? "..." : isPlaying ? "\u23F8 Pause" : "\u25B6 Play" : track.audioUrl ? "\u25B6 Play" : "\u2014"
                    }
                  ),
                  track.id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "a",
                    {
                      href: `/landing/track/${track.id}`,
                      className: "rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20 hover:border-cyan-400 text-center",
                      children: "Info"
                    }
                  )
                ] })
              ] })
            },
            `${track.trackNumber}-${track.title}`
          )) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "audio",
        {
          ref: audioRef,
          preload: "metadata",
          playsInline: true,
          controls: false,
          onContextMenu: (e) => e.preventDefault(),
          style: {
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserSelect: "none"
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", { className: "relative z-10 border-t border-white/10 bg-slate-950/80 backdrop-blur-lg", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-auto max-w-6xl px-6 py-12 md:px-10", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-col items-center gap-6 text-center", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "font-display text-3xl text-white", children: [
          "Galante ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-amber-400", children: "El Emperador" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "a",
            {
              href: "https://instagram.com/galantealx",
              target: "_blank",
              rel: "noopener noreferrer",
              className: "flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-all hover:border-pink-500 hover:bg-pink-500/20 hover:text-pink-400 hover:scale-110",
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-5 w-5", fill: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" }) })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "a",
            {
              href: "https://twitter.com/galantealx",
              target: "_blank",
              rel: "noopener noreferrer",
              className: "flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-all hover:border-sky-500 hover:bg-sky-500/20 hover:text-sky-400 hover:scale-110",
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-5 w-5", fill: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" }) })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "a",
            {
              href: "https://youtube.com/@galantealx",
              target: "_blank",
              rel: "noopener noreferrer",
              className: "flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-all hover:border-red-500 hover:bg-red-500/20 hover:text-red-400 hover:scale-110",
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-5 w-5", fill: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" }) })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "a",
            {
              href: "https://tiktok.com/@galantealx",
              target: "_blank",
              rel: "noopener noreferrer",
              className: "flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition-all hover:border-cyan-400 hover:bg-cyan-400/20 hover:text-cyan-300 hover:scale-110",
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "h-5 w-5", fill: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" }) })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "text-sm text-slate-500", children: [
          "\xA9 ",
          (/* @__PURE__ */ new Date()).getFullYear(),
          " Galante El Emperador. Todos los derechos reservados."
        ] })
      ] }) }) })
    ] });
  }
  function bootstrap() {
    const target = document.getElementById("album-landing-root");
    if (!target) return;
    const hydratedData = coerceLandingData(window.__ALBUM_LANDING_DATA__ || DEFAULT_LANDING_DATA);
    (0, import_client.createRoot)(target).render(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LandingApp, { data: hydratedData }));
  }
  bootstrap();
})();
