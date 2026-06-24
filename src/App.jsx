import { useState } from "react";
import AppLayout from "./components/AppLayout.jsx";
import { PAGE_IDS } from "./constants/navigation.js";
import { useAuth } from "./hooks/useAuth.js";
import MapPage from "./MapPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import ListPage from "./pages/ListPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import "./css/app-shell.css";

function App() {
  const {
    session,
    loading,
    sessionError,
    signIn,
    signUp,
    signOut,
  } = useAuth();

  const [activePage, setActivePage] = useState(PAGE_IDS.MAP);

  const handleLogout = async () => {
    const { error } = await signOut();

    if (error) {
      throw error;
    }

    setActivePage(PAGE_IDS.MAP);
  };

  if (loading) {
    return <main className="loading-screen">Yükleniyor...</main>;
  }

  if (!session?.user) {
    return (
      <AuthPage
        initialError={sessionError}
        onSignIn={signIn}
        onSignUp={signUp}
      />
    );
  }

  const user = session.user;
  const username = user.email?.split("@")[0] || "Kullanıcı";

  return (
    <AppLayout activePage={activePage} onNavigate={setActivePage}>
      {activePage === PAGE_IDS.MAP && <MapPage userId={user.id} />}

      {activePage === PAGE_IDS.LIST && (
        <ListPage username={username} />
      )}

      {activePage === PAGE_IDS.PROFILE && (
        <ProfilePage user={user} onLogout={handleLogout} />
      )}
    </AppLayout>
  );
}

export default App;