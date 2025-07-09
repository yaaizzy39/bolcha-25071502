export const modalOverlayStyle = {
  position: "fixed" as const,
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

export const modalContentStyle = {
  background: "#fff",
  padding: "2rem",
  borderRadius: "8px",
  maxWidth: "400px",
  width: "90%",
  maxHeight: "80vh",
  overflow: "auto",
};

export const modalButtonGroupStyle = {
  display: "flex",
  gap: "1rem",
  marginTop: "1rem",
  justifyContent: "flex-end",
};

export const modalPrimaryButtonStyle = {
  background: "#007bff",
  color: "#fff",
  border: "none",
  padding: "0.5rem 1rem",
  borderRadius: "4px",
  cursor: "pointer",
};

export const modalSecondaryButtonStyle = {
  background: "#6c757d",
  color: "#fff",
  border: "none",
  padding: "0.5rem 1rem",
  borderRadius: "4px",
  cursor: "pointer",
};