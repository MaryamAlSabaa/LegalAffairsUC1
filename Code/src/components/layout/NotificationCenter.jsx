import { useEffect, useRef, useState } from "react";
import Icon from "../common/Icon";

function NotificationCenter({ notifications = [], onMarkRead, onMarkAllRead, onSelectRequest }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function openNotification(notification) {
    if (!notification.isRead) await onMarkRead(notification.id);
    if (notification.requestId) onSelectRequest(notification.requestId);
    setIsOpen(false);
  }

  return (
    <div className="notification-center" ref={containerRef}>
      <button
        type="button"
        className={`icon-button notification-trigger ${isOpen ? "is-open" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={isOpen}
      >
        <Icon name="bell" size={19} />
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {isOpen && (
        <section className="notification-popover" aria-label="Notifications">
          <header className="notification-popover-header">
            <div><strong>Notifications</strong><span>{unreadCount} unread</span></div>
            {unreadCount > 0 && <button type="button" onClick={onMarkAllRead}>Mark all as read</button>}
          </header>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty"><Icon name="bell" size={23} /><strong>No notifications yet</strong><p>New request activity will appear here.</p></div>
            ) : notifications.map((notification) => (
              <button
                type="button"
                className={`notification-item ${notification.isRead ? "" : "is-unread"}`}
                key={notification.id}
                onClick={() => openNotification(notification)}
              >
                <span className="notification-item-icon"><Icon name={notification.type === "coverage_action" ? "warning" : "file"} size={17} /></span>
                <span className="notification-item-copy">
                  <strong>{notification.title}</strong>
                  <p>{notification.message}</p>
                  <time>{notification.createdAtLabel}</time>
                </span>
                {!notification.isRead && <i aria-label="Unread" />}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default NotificationCenter;
