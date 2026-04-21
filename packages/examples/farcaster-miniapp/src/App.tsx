import { useState, useEffect } from 'react'
import { sdk } from '@farcaster/miniapp-sdk'
import { Header } from './components/Header'
import { LoadingScreen } from './components/LoadingScreen'
import { TokagentChat } from './components/TokagentChat'
import './App.css'

function App() {
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        initialize()
    }, [])

    async function initialize() {
        try {
            setError(null)

            // Tell Farcaster the app is ready to display
            await sdk.actions.ready()
        } catch (err) {
            console.error('Failed to initialize:', err)
            const message = err instanceof Error ? err.message : 'Failed to initialize app'
            setError(message)
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoading) {
        return <LoadingScreen />
    }

    if (error) {
        return (
            <div className="error-container">
                <div className="error-card">
                    <h1>🤖 Tokagent</h1>
                    <p className="error-message">⚠️ {error}</p>
                    <button onClick={initialize} className="btn-retry">
                        Retry
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="app">
            <Header />

            <main className="content">
                <TokagentChat />
            </main>
        </div>
    )
}

export default App

