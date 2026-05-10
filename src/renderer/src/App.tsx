import * as React from 'react'
import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import DebugConsole from './components/DebugConsole'
import { useSettings } from './stores/settings.store'

function App(): React.JSX.Element {
  const refresh = useSettings((s) => s.refresh)
  const testConnection = useSettings((s) => s.testConnection)

  useEffect(() => {
    void (async () => {
      await refresh()
      const { config } = useSettings.getState()
      if (config.tuleapUrl && config.hasToken) {
        await testConnection()
      }
    })()
  }, [refresh, testConnection])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <DebugConsole />
    </div>
  )
}

export default App
