import { Link } from "react-router-dom";
import type { User } from "firebase/auth";

interface HomeProps {
  user: User;
}

const Home = ({ user }: HomeProps) => {
  return (
    <div style={{ 
      maxWidth: 600, 
      margin: '0 auto', 
      padding: '2rem',
      textAlign: 'center'
    }}>
      <h1 style={{ 
        marginBottom: '2rem', 
        color: '#333',
        fontSize: '2rem'
      }}>
        Bolcha - ホーム
      </h1>
      
      <p style={{ 
        marginBottom: '3rem', 
        color: '#666',
        fontSize: '1.1rem'
      }}>
        どちらの機能を使用しますか？
      </p>

      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: '1.5rem',
        maxWidth: 400,
        margin: '0 auto'
      }}>
        {/* チャットルーム */}
        <Link 
          to="/chat-rooms"
          style={{
            display: 'block',
            padding: '2rem',
            backgroundColor: '#007bff',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,123,255,0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#0056b3';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#007bff';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>チャットルーム</h2>
          <p style={{ margin: 0, opacity: 0.9 }}>
            リアルタイムチャットでコミュニケーション
          </p>
        </Link>

        {/* アイデア管理 */}
        <Link 
          to="/ideas"
          style={{
            display: 'block',
            padding: '2rem',
            backgroundColor: '#28a745',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(40,167,69,0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1e7e34';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#28a745';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>アイデア管理</h2>
          <p style={{ margin: 0, opacity: 0.9 }}>
            アイデアの投稿・管理・評価
          </p>
        </Link>
      </div>

      <div style={{ 
        marginTop: '3rem',
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        fontSize: '0.9rem',
        color: '#666'
      }}>
        <p style={{ margin: 0 }}>
          ログイン中: <strong>{user.displayName || user.email}</strong>
        </p>
      </div>
    </div>
  );
};

export default Home;