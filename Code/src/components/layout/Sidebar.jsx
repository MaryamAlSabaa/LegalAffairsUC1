import kuLogo from "../../../Assets/KULogo.png";
import Icon from "../common/Icon";

function Sidebar({ currentPage, onChangePage, navigationItems, currentUser }) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img src={kuLogo} alt="Khalifa University" />
        </div>
        <div className="sidebar-product">
          <span>Digital Services</span>
          <strong>Legal Affairs</strong>
        </div>
      </div>

      <div className="sidebar-divider" />

      <p className="sidebar-section-label">Workspace</p>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navigationItems.map((item) => {
          const isActive = currentPage === item.id;
          const isDisabled = item.disabled;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => !isDisabled && onChangePage(item.id)}
              disabled={isDisabled}
              title={item.disabledReason || item.label}
              className={`sidebar-nav-item ${isActive ? "is-active" : ""} ${isDisabled ? "is-disabled" : ""}`}
            >
              <span className="sidebar-nav-icon"><Icon name={item.icon || "file"} size={19} /></span>
              <span className="sidebar-nav-label">{item.label}</span>
              {isActive && <span className="sidebar-active-dot" />}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-security">
          <span className="sidebar-security-icon"><Icon name="shield" size={17} /></span>
          <div>
            <strong>Secure workspace</strong>
            <span>KU authorized access</span>
          </div>
        </div>
        {currentUser && (
          <p className="sidebar-role">Signed in as <strong>{currentUser.role}</strong></p>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
