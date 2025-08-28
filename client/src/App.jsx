import { useState } from "react";

export default function App() {
	const [loading, setLoading] = useState(false);

	async function onUpgrade() {
		setLoading(true);
		try {
			const r = await fetch("http://localhost:4000/api/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			const json = await r.json();
			if (json.url) {
				window.location.href = json.url;
			} else if (json.data?.url) {
				window.location.href = json.data.url;
			} else {
				console.log("No checkout URL returned: " + JSON.stringify(json));
			}

		} catch (e) {
			console.error(e);
			alert("Checkout failed");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div style={{ fontFamily: "system-ui", padding: 24 }}>
			<h1>Autumn + Stripe Demo</h1>
			<p>Current user: <code>demo-user-456</code></p>
			<button onClick={onUpgrade} disabled={loading}>
				{loading ? "Redirecting..." : "Upgrade to Pro ($20/mo)"}
			</button>
		</div>
	);
}
