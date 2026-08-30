import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AuthProvider, ProtectedRoute } from "./lib/auth"
import LoginPage from "./pages/LoginPage"
import RegisterPage from "./pages/RegisterPage"
import ChatPage from "./pages/ChatPage"

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route
                        path="/chat"
                        element={
                            <ProtectedRoute>
                                <ChatPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="*" element={<Navigate to="/chat" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}

export default App
