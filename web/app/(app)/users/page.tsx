import { requireUser } from "@/lib/auth";
import { db, type User } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { AddUserForm, UserActions } from "@/components/forms";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireUser("admin");
  const users = db.prepare("SELECT id,name,email,phone,role,status,last_seen,active FROM users ORDER BY active DESC, name").all() as User[];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Team</h1>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Last seen in app</th><th className="th" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-slate-400"}>
                <td className="td font-medium">{u.name}{!u.active && " (inactive)"}</td>
                <td className="td">{u.email}</td>
                <td className="td capitalize">{u.role}</td>
                <td className="td">{fmtDate(u.last_seen)}</td>
                <td className="td"><UserActions id={u.id} active={!!u.active} isSelf={u.id === me.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddUserForm />
    </div>
  );
}
