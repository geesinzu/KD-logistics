import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { DepartmentGate } from "@/components/departments/DepartmentGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
function Access() {
  const deps = trpc.department.departments.useQuery(),
    staff = trpc.department.staff.useQuery(),
    utils = trpc.useUtils();
  const [name, setName] = useState(""),
    [departmentId, setDepartment] = useState(""),
    [userId, setUser] = useState(""),
    [staffName, setStaffName] = useState(""),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState("");
  const done = () => void utils.department.invalidate();
  const add = trpc.department.createDepartment.useMutation({
    onSuccess: () => {
      setName("");
      done();
    },
    onError: e => toast.error(e.message),
  });
  const status = trpc.department.setStaffStatus.useMutation({
    onSuccess: done,
    onError: e => toast.error(e.message),
  });
  const assign = trpc.department.assignStaff.useMutation({
    onSuccess: () => {
      done();
      toast.success("Department access assigned.");
    },
    onError: e => toast.error(e.message),
  });
  const create = trpc.department.createStaff.useMutation({
    onSuccess: () => {
      done();
      setPassword("");
      setPhone("");
      setStaffName("");
      toast.success(
        "Account created. Share its login details privately with the staff member."
      );
    },
    onError: e => toast.error(e.message),
  });
  const select = (
    <div>
      <Label htmlFor="access-department">Department</Label>
      <select
        id="access-department"
        className="ops-select w-full"
        required
        value={departmentId}
        onChange={e => setDepartment(e.target.value)}
      >
        <option value="">Select department</option>
        {deps.data?.map(d => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="management-page space-y-5">
      <Link to="/department-packages" className="underline">
        Department packages
      </Link>
      <h1 className="management-title">Department staff access</h1>
      <p>
        Super Admin assigns department access. Staff use the normal KEDI login
        and cannot choose their own department.
      </p>
      {(deps.error || staff.error) && (
        <p role="alert">
          Could not load access settings.{" "}
          <button
            onClick={() => {
              void deps.refetch();
              void staff.refetch();
            }}
          >
            Retry
          </button>
        </p>
      )}
      <form
        className="ops-panel p-5 space-y-3"
        onSubmit={e => {
          e.preventDefault();
          add.mutate({ name });
        }}
      >
        <h2 className="text-xl font-semibold">Create a department</h2>
        <Label htmlFor="department-name">Name</Label>
        <Input
          id="department-name"
          required
          minLength={2}
          maxLength={100}
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <Button disabled={add.isPending}>Add department</Button>
      </form>
      <section className="ops-panel p-5 space-y-4">
        <h2 className="text-xl font-semibold">Create or assign staff</h2>
        {select}
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault();
            create.mutate({
              name: staffName,
              phone,
              password,
              departmentId: Number(departmentId),
            });
          }}
        >
          <h3 className="font-semibold">New department account</h3>
          <Label htmlFor="dep-staff-name">Staff name</Label>
          <Input
            id="dep-staff-name"
            required
            minLength={2}
            maxLength={100}
            value={staffName}
            onChange={e => setStaffName(e.target.value)}
          />
          <Label htmlFor="dep-staff-phone">11-digit phone</Label>
          <Input
            id="dep-staff-phone"
            type="tel"
            pattern="[0-9]{11}"
            required
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <Label htmlFor="dep-staff-password">
            Initial password (12 characters minimum)
          </Label>
          <Input
            id="dep-staff-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={100}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <Button disabled={!departmentId || create.isPending}>
            Create department account
          </Button>
        </form>
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={e => {
            e.preventDefault();
            if (
              window.confirm(
                "Change this staff account to department-only access? Their existing operational role and branch assignment will be removed."
              )
            )
              assign.mutate({
                userId: Number(userId),
                departmentId: Number(departmentId),
              });
          }}
        >
          <h3 className="font-semibold">Assign an existing account</h3>
          <Label htmlFor="assign-department-user">Staff member</Label>
          <select
            id="assign-department-user"
            className="ops-select w-full"
            required
            value={userId}
            onChange={e => setUser(e.target.value)}
          >
            <option value="">Select staff</option>
            {staff.data
              ?.filter(u => !["admin", "super_admin"].includes(u.role))
              .map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.department ?? u.role}
                </option>
              ))}
          </select>
          <p className="text-sm">
            This changes the account to Department Staff. Changing department
            also changes which department transactions they can access.
          </p>
          <Button
            variant="outline"
            disabled={!departmentId || assign.isPending}
          >
            Assign department-only access
          </Button>
        </form>
      </section>
      <section className="ops-panel p-5">
        <h2 className="text-xl font-semibold">Assigned department staff</h2>
        <ul className="divide-y">
          {staff.data
            ?.filter(u => u.role === "department_staff")
            .map(u => (
              <li key={u.id} className="py-3">
                <strong>{u.name}</strong>
                <p>
                  {u.department ?? "No department assigned"} · {u.phone} ·{" "}
                  {u.status}
                </p>
                <Button
                  variant="outline"
                  disabled={status.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `${u.status === "active" ? "Suspend" : "Activate"} this department account?`
                      )
                    )
                      status.mutate({
                        userId: u.id,
                        status: u.status === "active" ? "suspended" : "active",
                      });
                  }}
                >
                  {u.status === "active"
                    ? "Suspend account"
                    : "Activate account"}
                </Button>
              </li>
            ))}
        </ul>
        <p className="text-sm mt-3">
          Suspend or reactivate accounts through Users. No signup grants
          department access automatically.
        </p>
      </section>
    </div>
  );
}
export default function DepartmentAccess() {
  return (
    <DepartmentGate>
      <Access />
    </DepartmentGate>
  );
}
