import { useTheme } from "../context/ThemeContext";

interface HeaderProps {
  memberName?: string;
  couponCode?: string;
  onSignOut: () => void;
  rightSlot?: React.ReactNode;
}

export function Header({ memberName, couponCode, onSignOut, rightSlot }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="mm-header">
      <div className="mm-header-brand">
        <img src="/logo-m.png" alt="Mental Madness" className="mm-logo-mark" />
        <span className="mm-wordmark">MENTAL MADNESS</span>
      </div>

      <div className="mm-header-actions">
        {(memberName || couponCode) && (
          <div className="mm-header-member">
            {memberName && <div className="mm-member-name">{memberName}</div>}
            {couponCode && <div className="mm-member-coupon">{couponCode}</div>}
          </div>
        )}
        <div className="mm-header-buttons">
          {rightSlot}
          <button type="button" className="mm-link-btn" onClick={toggleTheme}>
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </button>
          <button type="button" className="mm-link-btn" onClick={onSignOut}>
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
