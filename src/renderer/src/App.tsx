import * as React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './components/Sidebar'

function App(): React.JSX.Element {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default App
