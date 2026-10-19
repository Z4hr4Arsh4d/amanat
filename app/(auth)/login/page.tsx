import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export default function LoginPage() {
  return (
    <AuthForm
      title="Log in"
      subtitle="Welcome back. Log in to see your leads."
      submit="Log in"
      action={loginAction}
      fields={[
        { name: "workspace", label: "Workspace", autoComplete: "organization", placeholder: "e.g. sunrise-solar", hint: "Your company's short name in Amanat. It is in your invite email." },
        { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@company.com" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      footer={{ text: "New company?", href: "/signup", link: "Create a workspace" }}
    />
  );
}
