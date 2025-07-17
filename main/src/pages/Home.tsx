import { Link } from "react-router-dom";
import type { User } from "firebase/auth";
import { useI18n } from "../i18n";
import useUserRole from "../hooks/useUserRole";
import { useIsProjectMember } from "../hooks/useIsProjectMember";

interface HomeProps {
  user: User;
}

const Home = ({ user }: HomeProps) => {
  const { t, lang } = useI18n();
  const userRole = useUserRole(user);
  const { isProjectMember } = useIsProjectMember(user);
  
  const canAccessIdeas = userRole === 'admin' || isProjectMember;
  
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
        {t("homeTitle")}
      </h1>
      
      <p style={{ 
        marginBottom: '3rem', 
        color: '#666',
        fontSize: '1.1rem'
      }}>
        {t("homeSubtitle")}
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
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>{t("chatRooms")}</h2>
          <p style={{ margin: 0, opacity: 0.9 }}>
            {t("chatRoomsDesc")}
          </p>
        </Link>

        {/* アイデア管理 */}
        {canAccessIdeas && (
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
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>{t("ideaManagement")}</h2>
            <p style={{ margin: 0, opacity: 0.9 }}>
              {t("ideaManagementDesc")}
            </p>
          </Link>
        )}
      </div>

      <div style={{ 
        marginTop: '3rem',
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#888',
        textAlign: 'left',
        lineHeight: '1.4'
      }}>
        <p style={{ margin: 0 }}>
          {lang === 'en' ? (
            "This app is a test version. The creator cannot take responsibility for any issues that may arise from using this app. Additionally, automatic translation is not perfect, so please respond with an open mind even if the content is translated in a way that may be offensive."
          ) : (
            "このアプリはテスト版です。このアプリを使用して万が一問題が生じても作成者は責任をとれません。また、自動翻訳は完ぺきではありませんので、気分を害する内容に翻訳されたとしても、広い心でご対応ください。"
          )}
        </p>
      </div>
    </div>
  );
};

export default Home;