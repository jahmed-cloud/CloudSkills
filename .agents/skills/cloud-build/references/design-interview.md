# Infrastructure design interview

Use this mode when someone asks to be grilled on their infrastructure design or wants to work through it in a document. Open the application source, deployment files and any existing design or requirements first. On resume, read the saved design and continue at the first unresolved decision that affects the implementation.

1. Create or open a Markdown design record in the working folder. Capture the application, outcome, facts verified from source, confirmed decisions, proposals and open questions. Use relative links to existing evidence or implementation files.
2. Ask one decision at a time. Start with the question that changes the architecture most. Give a recommendation and the reason it fits the evidence, then explain the most relevant trade-off or failure case. Ask a follow-up if the answer leaves the decision ambiguous. Look for answers already present in the code or supplied policy before asking the user.
3. Update the record after each answer. Mark user decisions as accepted, working assumptions as proposed and unknowns as open. Keep the reason for any changed decision. Record the scope and acceptance check so another session can pick up the work.
4. Develop the parts of the design that are already supported. Common decision dependencies are access and trust boundaries before ingress and identity, data ownership before persistence and recovery, and workload constraints before sizing. Choose the order that fits the application.
5. Once a concrete design has enough inputs, create the Terraform or other requested infrastructure code and run available validation. Leave unresolved values as explicit inputs. A decision about the design does not grant permission to deploy it.

Useful questions challenge a consequence. Ask who could read a different team's data if a shared service identity has access to both subscriptions, or what can be rebuilt if the policy store is lost. A long questionnaire is rarely useful. Keep the next unresolved decision visible in the document and the conversation.
