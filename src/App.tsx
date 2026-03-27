import { DataWorkspace } from './components/DataInput/DataWorkspace'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { useDarkMode } from './hooks/useDarkMode'
import './App.css'

function App() {
  const { dark, toggle } = useDarkMode()

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Market Research Agent</h1>
          <span className="app-subtitle">Paste survey data. Get publication-ready analysis.</span>
        </div>
        <button className="theme-toggle btn btn-secondary" onClick={toggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {dark ? '☀ Light' : '☾ Dark'}
        </button>
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
