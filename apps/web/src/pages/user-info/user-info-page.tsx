import { useNavigate } from 'react-router-dom';
import { Inbox, LogOut, ShieldCheck } from 'lucide-react';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';

export function UserInfoPage() {
  const navigate = useNavigate();
  const user = getUser();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Graceful degradation: clear local session even if API fails
    }
    clearAuth();
    navigate('/login');
  };

  const initials = user?.name?.charAt(0) ?? '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center justify-center w-8 h-8 bg-primary rounded-lg">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">CDMP</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-primary">{initials}</span>
            </div>
            <span className="text-sm text-gray-700 font-medium">{user?.name}</span>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-danger rounded-lg hover:bg-red-50 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>登出</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
            <Inbox className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-medium text-gray-700 mb-2">目前尚無可用功能</h2>
          <p className="text-sm text-gray-400">請聯絡您的管理員。</p>
        </div>
      </main>
    </div>
  );
}
