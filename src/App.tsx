import { DataWorkspace } from './components/DataInput/DataWorkspace'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Market Research Agent</h1>
        <span className="app-subtitle">Paste survey data. Get publication-ready analysis.</span>
      </header>
      <main className="app-main">
        <ErrorBoundary>
          <DataWorkspace />
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
