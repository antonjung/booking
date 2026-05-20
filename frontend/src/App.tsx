import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BookingsList from './pages/BookingsList'
import NewBooking from './pages/NewBooking'
import BookingDetail from './pages/BookingDetail'
import ControllerPanel from './pages/ControllerPanel'
import AdminUsers from './pages/AdminUsers'
import AdminFacilities from './pages/AdminFacilities'
import Profile from './pages/Profile'
import Calendar from './pages/Calendar'

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-700" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-700 mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Calendar />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="bookings" element={<BookingsList />} />
        <Route path="bookings/new" element={<NewBooking />} />
        <Route path="bookings/:id" element={<BookingDetail />} />
        <Route
          path="controller"
          element={
            <RequireAuth roles={['controller', 'admin']}>
              <ControllerPanel />
            </RequireAuth>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequireAuth roles={['admin']}>
              <AdminUsers />
            </RequireAuth>
          }
        />
        <Route
          path="admin/facilities"
          element={
            <RequireAuth roles={['admin']}>
              <AdminFacilities />
            </RequireAuth>
          }
        />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
