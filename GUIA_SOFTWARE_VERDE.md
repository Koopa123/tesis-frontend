# Guía de codificación verde — frontend

Reglas para que la interfaz de CrowdSense AI consuma poco en la laptop y en la red. Las reglas del análisis de
video están en `GUIA_SOFTWARE_VERDE.md` del repositorio `tesis-backend`. Todo cambio nuevo debe respetarlas; si
alguno no puede cumplir una, hay que explicar el motivo en el commit.

1. **Cargar las evidencias bajo demanda.** El clip de una alerta se descarga solo cuando el usuario pulsa
   "Ver clip" (`AlertasPage.tsx`); no reproducir ni precargar videos por defecto.
2. **No abrir flujos que no se muestran.** Pedir el MJPEG y los eventos SSE solo de las cámaras visibles en
   pantalla.
3. **Refrescar con moderación.** Los datos que se consultan por intervalo se refrescan cada 5 s o más, nunca en
   cada fotograma.
4. **Recibir solo los datos necesarios.** Usar los límites de los listados que ofrece la API en vez de traer
   todo el historial.
5. **Mantener el paquete liviano.** Antes de agregar una librería, comprobar que no exista ya algo equivalente en el
   proyecto; el frontend se compila a archivos estáticos que Vercel sirve desde su red de distribución.
