export const fixedHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  position: "fixed" as const,
  width: "100%",
  left: 0,
  right: 0,
  top: 0,
  background: "#fff",
  zIndex: 100,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

export const headerContentStyle = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: "1rem 1rem 0 1rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
};

export const headerTitleStyle = {
  margin: 0,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
};

export const headerNavStyle = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
};

export const mainContentStyle = {
  padding: "60px 1rem 1rem 1rem",
  flex: 1,
  display: "flex",
  flexDirection: "column" as const,
};

export const floatingButtonStyle = {
  position: "fixed" as const,
  bottom: "80px",
  right: "1rem",
  width: "50px",
  height: "50px",
  borderRadius: "50%",
  background: "#007bff",
  color: "#fff",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  zIndex: 100,
  fontSize: "18px",
};