import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Database, LogOut, Plus } from 'lucide-react';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { CreateAccountModal } from './create-account-modal';

export function AccountListPage() {
  const navigate = useNavigate();
  const user = getUser();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Graceful degradation
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    // TODO: F005 will implement account list refresh
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary tracking-wide">CDMP</h1>
          <p className="text-xs text-gray-500 mt-0.5">資料治理平台</p>
        </div>
        <nav className="flex-1 py-3">
          <a
            href="#"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-primary bg-blue-50 border-l-[3px] border-primary font-medium"
          >
            <Users size={20} />
            帳號管理
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Database size={20} />
            資料來源
          </a>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">帳號管理</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut size={16} />
              登出
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-5">
            <Button onClick={() => setShowCreateModal(true)}>
              <span className="flex items-center gap-2">
                <Plus size={16} />
                建立帳號
              </span>
            </Button>
          </div>

          {/* Stub table - F005 will implement */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-400">
            帳號清單（F005 實作）
          </div>
        </main>
      </div>

      {/* Create Account Modal */}
      <CreateAccountModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
