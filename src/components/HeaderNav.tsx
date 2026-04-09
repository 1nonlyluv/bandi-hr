import { Link } from "react-router-dom";
import bandiLogo from "../../반디로고.png";

type Props = {
  showCalendarLink?: boolean;
  hideNav?: boolean;
};

export function HeaderNav({ showCalendarLink = false, hideNav = false }: Props) {
  return (
    <header className={`site-header ${hideNav ? "minimal" : ""}`}>
      <Link className="brand" to="/">
        <img className="brand-logo" src={bandiLogo} alt="반디 로고" />
        <span className="brand-text">반디</span>
      </Link>
      {!hideNav && showCalendarLink ? (
        <nav className="site-nav">
          <Link to="/calendar">월간 캘린더</Link>
        </nav>
      ) : null}
    </header>
  );
}
