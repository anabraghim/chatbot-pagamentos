import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@aws-amplify/ui-react/styles.css"
import "./index.css"
import "./lib/amplify" // configura o Cognito antes de renderizar
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>
)
