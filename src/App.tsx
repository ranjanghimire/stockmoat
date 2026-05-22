import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import AdminMoatSnapshotPage from './pages/AdminMoatSnapshotPage'
import ChartsPage from './pages/ChartsPage'
import HomePage from './pages/HomePage'
import NewsPage from './pages/NewsPage'
import ScreenerPage from './pages/ScreenerPage'

function TopNav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-2 py-1 transition ${isActive ? 'bg-moat-ink text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-moat-ink'}`

  return (
    <div className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2 text-sm font-medium">
        <NavLink to="/" end className={linkClass}>
          Analyzer
        </NavLink>
        <NavLink to="/screen" className={linkClass}>
          Screener
        </NavLink>
        <NavLink to="/charts" className={linkClass}>
          Charts
        </NavLink>
        <NavLink to="/news" className={linkClass}>
          News
        </NavLink>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <TopNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/screen" element={<ScreenerPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/admin/moat-snapshot" element={<AdminMoatSnapshotPage />} />
      </Routes>
    </BrowserRouter>
  )
}
