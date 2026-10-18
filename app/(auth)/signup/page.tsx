import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export default function SignupPage() {
  return (
    <AuthForm
      title="Create your workspace"
      subtitle="You will be the Owner."
      submit="Create workspace"
      action={signupAction}
      fields={[
        { name: "company", label: "Company name", autoComplete: "organization" },
        { name: "name", label: "Your name", autoComplete: "name" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password (8+ characters)", type: "password", autoComplete: "new-password" },
      ]}
      footer={{ text: "Already have an account?", href: "/login", link: "Log in" }}
    />
  );
}
