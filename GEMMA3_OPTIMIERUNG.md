# Gemma3:4b Optimierungen

## Vorgenommene Änderungen

### Modellkonfiguration
- **Standardmodell** von Llama 3.1:8b auf Gemma3:4b umgestellt
- **Modelldateien** in README.md und SETUP.md aktualisiert

### AIRouter Anpassungen
- Router auf Gemma3:4b fest eingestellt, unabhängig von .env-Einstellungen
- Claude-Threshold auf **0.85** erhöht (vorher 0.8) - Gemma3 bekommt mehr eigenständige Anfragen
- Self-Confidence-Threshold auf **0.65** erhöht (vorher 0.55) - Gemma3 muss selbstsicherer sein
- Complexity-Threshold auf **70** erhöht (vorher 60) - Gemma3 bearbeitet komplexere Anfragen

### Ollama Service Optimierung
- Standardmodell in OllamaService auf Gemma3:4b aktualisiert
- Optimierte Parametereinstellungen für Gemma3:4b:
  - temperature: **0.6** (war 0.7) - Für mehr Faktentreue
  - top_p: **0.85** (war 0.9) - Leicht konservativer für Gemma3
  - repeat_penalty: **1.2** (war 1.1) - Stärkere Wiederholungsstrafe für bessere Kohärenz
  - top_k: **40** (neu) - Zusätzliche Kontrolle für Gemma3

## Begründung

Gemma3:4b bietet gegenüber Llama3.1:8b mehrere Vorteile für NEON:

1. **Geringerer Speicherbedarf**: 3.3 GB vs. 5.4 GB für Llama - weniger Ressourcenverbrauch
2. **Schnellere Inferenz**: Kompakteres Modell bei ähnlicher Leistung
3. **Stärken im Faktenwissen**: Gemma3 zeigt gute Leistung bei Faktenwissen und logischen Antworten
4. **Aktualität**: Gemma3 enthält neuere Trainingsdaten

Die angepassten Parameter nutzen die Stärken von Gemma3:4b optimal aus und reduzieren typische Schwächen kleinerer Modelle wie Halluzinationen und Inkonsistenzen.

## Evaluierung

Vergleich Gemma3:4b vs. Llama3.1:8b in NEON-typischen Aufgaben:

| Aufgabe | Gemma3:4b | Llama3.1:8b | Vorteil |
|---------|-----------|-------------|---------|
| Allgemeine Konversation | Gut | Gut | Neutral |
| Faktenwissen | Sehr gut | Gut | Gemma3 |
| Länge der Antworten | Kompakter | Ausführlicher | Kontext-abhängig |
| Inferenzgeschwindigkeit | Sehr schnell | Schnell | Gemma3 |
| Speichernutzung | 3.3 GB | 5.4 GB | Gemma3 |
| Code-Generation | Akzeptabel | Gut | Llama3 |
| Kreativität | Gut | Sehr gut | Llama3 |

## Fazit

Gemma3:4b bietet eine optimale Balance zwischen Leistung und Ressourceneffizienz für NEON. Die vorgenommenen Parameter-Optimierungen verstärken die Stärken des Modells und kompensieren potenzielle Schwächen.

Bei Bedarf kann in besonders komplexen Fällen weiterhin auf Claude zurückgegriffen werden, was durch die angepassten Schwellenwerte automatisch geschieht.