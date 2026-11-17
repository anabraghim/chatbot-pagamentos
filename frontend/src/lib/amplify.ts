import { Amplify } from "aws-amplify"
import { I18n } from "aws-amplify/utils"
import { translations } from "@aws-amplify/ui-react"

// Os IDs do Cognito não são segredo (ficam visíveis no navegador de qualquer forma).
// Eles vêm das variáveis VITE_* (arquivo .env.local no seu computador; "Environment variables" no Amplify).
Amplify.configure({
    Auth: {
        Cognito: {
            userPoolId: import.meta.env.VITE_USER_POOL_ID,
            userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
        },
    },
})

I18n.putVocabularies(translations)
I18n.setLanguage("pt")
