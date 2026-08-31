import { createRoot } from "react-dom/client";
import "./standalone.css";
import { StudioPage } from "./StudioPage";

/**
 * Punto de entrada del estudio como aplicacion suelta, sin el resto del sitio.
 * `npm run build:studio` lo empaqueta en un unico HTML que se puede abrir
 * desde cualquier sitio, movil incluido.
 */
createRoot(document.getElementById("studio-root")!).render(<StudioPage />);
