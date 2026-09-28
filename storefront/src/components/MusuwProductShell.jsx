import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { ChatCenteredText } from "@phosphor-icons/react/ChatCenteredText";
import { DotsThree } from "@phosphor-icons/react/DotsThree";
import { FolderSimple } from "@phosphor-icons/react/FolderSimple";
import { UsersThree } from "@phosphor-icons/react/UsersThree";

export function MusuwProductShell({
  activeItem = "chat",
  ariaHidden = false,
  children,
  className = "",
  shellRef,
  title,
  ...rootProps
}) {
  return (
    <div
      {...rootProps}
      className={`musuw-product-shell ${className}`.trim()}
      data-musuw-product-shell="true"
      ref={shellRef}
      aria-hidden={ariaHidden ? "true" : undefined}
    >
      <aside className="visual-sidebar is-collapsed musuw-shell-sidebar hero-demo-sidebar" data-product-app-sidebar="true" data-product-app-sidebar-state="collapsed">
        <div className="visual-sidebar__collapsed-main musuw-shell-collapsed">
          <button type="button" className="visual-sidebar__collapsed-logo musuw-shell-logo hero-demo-logo" tabIndex="-1" aria-label="Musuw" disabled><img src="/images/musuw-logo.png" alt="" draggable={false} /></button>
          <button type="button" className="visual-sidebar__collapsed-control musuw-shell-collapse hero-demo-collapse" tabIndex="-1" aria-label="Expand sidebar" disabled><CaretRight size={13} weight="bold" /></button>
          <div className="visual-sidebar__collapsed-divider musuw-shell-divider hero-demo-side-divider" />
          <button type="button" className="visual-sidebar__collapsed-nav is-new musuw-shell-collapsed-nav" tabIndex="-1" aria-label="New chat" disabled><ChatCenteredText size={17} /></button>
          <button type="button" className={`visual-sidebar__collapsed-nav musuw-shell-collapsed-nav ${activeItem === "library" ? "is-active" : ""}`} tabIndex="-1" aria-label="Knowledge bases" disabled><FolderSimple size={17} /></button>
          <button type="button" className="visual-sidebar__collapsed-nav musuw-shell-collapsed-nav" tabIndex="-1" aria-label="Agents" disabled><UsersThree size={17} /></button>
        </div>
        <div className="visual-sidebar__drag-handle" aria-hidden="true" />
        <div className="visual-sidebar__collapsed-user musuw-shell-collapsed-user"><span className="musuw-shell-avatar hero-demo-avatar">E</span></div>
      </aside>

      <div className="musuw-shell-workspace hero-demo-workspace">
        <div className="musuw-shell-title hero-demo-title">
          <strong>{title}</strong>
          <DotsThree size={13} weight="bold" />
        </div>
        {children}
      </div>
    </div>
  );
}
