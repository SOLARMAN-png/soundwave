import { House, Search, Library } from "lucide-react";
const tabs = [{ label: "Home", icon: House }, { label: "Search", icon: Search }, { label: "Library", text: "Your Library", icon: Library }];
export function BottomNav({ activePage, onNavigate }) {
 const active = ["CreatePlaylist", "AIPlaylistGenerator"].includes(activePage) ? "Library" : activePage;
 return <nav className="bottom-nav" aria-label="Main navigation">{tabs.map(({label,text,icon:Icon}) => <button key={label} className={`bottom-nav__item ${active===label?"is-active":""}`} onClick={() => onNavigate(label)}><Icon size={23}/><span>{text||label}</span></button>)}</nav>;
}
