import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Sin <StrictMode>: en dev monta cada componente dos veces a propósito, lo
// que abre dos conexiones RTSP casi simultáneas contra la misma cámara
// física (ver CameraTile en MulticamaraPage.tsx). El código ya maneja esa
// doble conexión correctamente del lado de la sesión en la BD, pero algunas
// cámaras no sueltan la conexión RTSP vieja lo bastante rápido y se quedan
// colgadas ~30s. No afecta producción: ahí React nunca duplica el montaje.
createRoot(document.getElementById('root')!).render(<App />)
