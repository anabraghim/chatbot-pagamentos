import { Authenticator } from "@aws-amplify/ui-react"
import ChatPage from "./pages/ChatPage"

// O Authenticator só renderiza o chat depois do login no Cognito.
// hideSignUp: sem opção de criar conta (cadastro só por convite do administrador).
function App() {
    return (
        <Authenticator hideSignUp>
            {({ signOut }) => <ChatPage onSignOut={() => signOut?.()} />}
        </Authenticator>
    )
}

export default App
