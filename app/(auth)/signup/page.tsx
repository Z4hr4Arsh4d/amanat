import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export default function SignupPage() {
  return (
    <AuthForm
      title="Create your workspace"
      subtitle="Set up Amanat for your company. You will be the Owner and can invite your team next."
      submit="Create workspace"
      action={signupAction}
      fields={[
        { name: "company", label: "Company name", autoComplete: "organization", placeholder: "e.g. Sunrise Solar" },
        { name: "name", label: "Your name", autoComplete: "name", placeholder: "e.g. Ayesha Khan" },
        { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@company.com" },
        { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
      ]}
      footer={{ text: "Already have an account?", href: "/login", link: "Log in" }}
    />
  );
}
