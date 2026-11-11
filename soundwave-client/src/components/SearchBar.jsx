import { Search as SearchIcon } from "lucide-react";
export default function SearchBar({ value, onChange, onSubmit, placeholder="Search songs, artists, albums..." }) { return <form className="search-bar" onSubmit={e=>{e.preventDefault();onSubmit?.();}}><SearchIcon size={21}/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}/></form>; }
