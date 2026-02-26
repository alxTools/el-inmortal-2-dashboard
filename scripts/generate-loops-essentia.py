#!/usr/bin/env python3

"""
Essentia Loop Generator
Analiza archivos de audio y detecta beats/secciones musicales usando Essentia
"""

import json
import sys
import os
from pathlib import Path

try:
    import essentia
    import essentia.standard as es

    ESSENTIA_AVAILABLE = True
except ImportError:
    print("⚠️  Essentia no disponible. Instala con: pip install essentia")
    ESSENTIA_AVAILABLE = False


def analyze_audio(audio_file):
    """
    Analiza un archivo de audio usando Essentia
    Retorna información de tempo, beats y energía
    """
    if not ESSENTIA_AVAILABLE:
        return None

    try:
        # Cargar audio
        print(f"[Essentia] Cargando audio: {audio_file}")
        loader = es.MonoLoader(filename=audio_file)
        audio = loader()

        # Detectar tempo y beats
        rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
        bpm, beats, beats_confidence, _, beats_intervals = rhythm_extractor(audio)

        print(f"[Essentia] Tempo detectado: {bpm:.1f} BPM")
        print(f"[Essentia] Beats detectados: {len(beats)}")

        # Calcular energía por beat
        window_size = int(0.1 * 44100)  # 100ms a 44.1kHz
        hop_size = window_size // 2

        energy_analyzer = es.Energy()
        energies = []

        for beat_time in beats:
            # Calcular índice de muestra
            sample_idx = int(beat_time * 44100)
            start = max(0, sample_idx - window_size // 2)
            end = min(len(audio), sample_idx + window_size // 2)

            if end > start:
                energy = energy_analyzer(audio[start:end])
                energies.append({"time": float(beat_time), "energy": float(energy)})

        # Detectar cambios de sección (usando novelty)
        novelty_curve = es.NoveltyCurve()
        novelty = novelty_curve(audio)

        # Encontrar picos en la curva de novedad (cambios de sección)
        peaks = []
        for i in range(1, len(novelty) - 1):
            if novelty[i] > novelty[i - 1] and novelty[i] > novelty[i + 1]:
                if novelty[i] > 0.1:  # Umbral mínimo
                    time = i * hop_size / 44100
                    peaks.append({"time": float(time), "novelty": float(novelty[i])})

        print(f"[Essentia] Cambios de sección detectados: {len(peaks)}")

        return {
            "success": True,
            "bpm": float(bpm),
            "beats": [float(b) for b in beats],
            "beats_confidence": float(beats_confidence),
            "beat_energies": energies,
            "section_changes": peaks[:20],  # Top 20 cambios
        }

    except Exception as e:
        print(f"[Essentia] Error analizando audio: {e}")
        return {"success": False, "error": str(e)}


def select_best_segments(
    analysis_result, duration, num_segments=4, segment_duration=15
):
    """
    Selecciona los mejores segmentos basados en energía y cambios de sección
    """
    if not analysis_result or not analysis_result.get("success"):
        return []

    energies = analysis_result.get("beat_energies", [])
    sections = analysis_result.get("section_changes", [])
    beats = analysis_result.get("beats", [])

    if not energies:
        # Fallback: dividir uniformemente
        step = duration / (num_segments + 1)
        segments = []
        for i in range(1, num_segments + 1):
            start = step * i - segment_duration / 2
            end = start + segment_duration
            if end <= duration and start >= 0:
                segments.append({"start": start, "end": end, "confidence": 0.5})
        return segments

    # Calcular energía promedio por ventana deslizante
    window_size = segment_duration
    hop = 5  # Salto de 5 segundos

    windows = []
    for start in range(0, int(duration - window_size), hop):
        end = start + window_size

        # Energía promedio en esta ventana
        window_energies = [e["energy"] for e in energies if start <= e["time"] < end]
        avg_energy = (
            sum(window_energies) / len(window_energies) if window_energies else 0
        )

        # Bonus por cercanía a cambios de sección
        section_bonus = sum(1 for s in sections if start <= s["time"] < end) * 0.1

        # Bonus por número de beats (ritmo consistente)
        beats_count = sum(1 for b in beats if start <= b < end)
        beat_bonus = min(beats_count * 0.01, 0.2)

        score = avg_energy + section_bonus + beat_bonus

        windows.append(
            {
                "start": start,
                "end": end,
                "score": score,
                "energy": avg_energy,
                "beats_count": beats_count,
            }
        )

    # Ordenar por score y seleccionar mejores
    windows.sort(key=lambda x: x["score"], reverse=True)

    # Seleccionar con separación mínima de 30 segundos
    selected = []
    min_gap = 30

    for window in windows:
        # Verificar separación
        too_close = any(abs(window["start"] - s["start"]) < min_gap for s in selected)
        if not too_close:
            selected.append(window)

        if len(selected) >= num_segments:
            break

    # Ordenar por posición temporal
    selected.sort(key=lambda x: x["start"])

    # Formatear resultado
    segments = [
        {
            "start": s["start"],
            "end": s["end"],
            "confidence": min(s["score"] / max(w["score"] for w in windows), 1.0)
            if windows
            else 0.5,
        }
        for s in selected
    ]

    return segments


def main():
    if len(sys.argv) < 2:
        print("Uso: python generate-loops-essentia.py <audio-file> [track-id]")
        sys.exit(1)

    audio_file = sys.argv[1]
    track_id = sys.argv[2] if len(sys.argv) > 2 else "unknown"

    if not os.path.exists(audio_file):
        print(f"❌ Archivo no encontrado: {audio_file}")
        sys.exit(1)

    if not ESSENTIA_AVAILABLE:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "Essentia no disponible",
                    "method": "essentia",
                }
            )
        )
        sys.exit(1)

    print(f"[Essentia] Analizando track {track_id}...")

    # Analizar audio
    result = analyze_audio(audio_file)

    if result and result.get("success"):
        # Obtener duración
        try:
            duration_extractor = es.Duration()
            audio = es.MonoLoader(filename=audio_file)()
            duration = duration_extractor(audio)
        except:
            duration = max(result["beats"]) if result["beats"] else 180

        # Seleccionar segmentos
        segments = select_best_segments(result, duration)

        result["duration"] = float(duration)
        result["segments"] = segments
        result["track_id"] = track_id
        result["method"] = "essentia"

        print(
            f"[Essentia] ✅ Análisis completado. Segmentos seleccionados: {len(segments)}"
        )

    # Output JSON
    print("\n" + json.dumps(result, indent=2))

    sys.exit(0 if result and result.get("success") else 1)


if __name__ == "__main__":
    main()
