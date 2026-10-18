import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export default function LoginPage() {
  return (
    <AuthForm
      title="Log in"
      subtitle="Every lead is an amanat."
      submit="Log in"
      action={loginAction}
      fields={[
        { name: "workspace", label: "Workspace (e.g. sunrise-solar)", autoComplete: "organization" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      footer={{ text: "New company?", href: "/signup", link: "Create a workspace" }}
    />
  );
}
