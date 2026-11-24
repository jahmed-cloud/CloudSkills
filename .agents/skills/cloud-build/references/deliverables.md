# Service implementation deliverables

Use a subfolder of the user's selected working directory, such as `services/<workload>/<run>/`. Keep files concise and specific to the chosen service; do not create empty deliverables for unsupported features.

```text
services/<workload>/<run>/
  requirements.md
  design.md
  policy-review.md
  infrastructure/
    main.tf.json
    variables.example.md
  validation.md
  deployment-checklist.md
  operations.md
```

`requirements.md` records confirmed requirements, assumptions and open decisions. `design.md` explains service choice, dependencies, ingress/egress, identity, failure/recovery behavior, sizing and alternatives. Reference existing resource IDs where reuse is proposed and keep diagrams consistent with the design; inferred planned connections must be distinguished from collected resource references.

`policy-review.md` links applicable organization control IDs and sources to specific configuration decisions. Record policy definitions that cannot be evaluated, missing assignment/exemption context and any policy conflicts. Generated defaults and sample tags are not organization approval. Do not label an implementation compliant merely because supported static checks passed.

`infrastructure/` contains one coherent Terraform root module per independently deployable component. When the requested implementation is PowerShell, save a parameterized `.ps1` with its required modules, Azure context, and validation notes instead. Document variables, which are required, expected formats, secret-handling guidance and environment-specific values. Do not store real credentials or secret-bearing state. Plans/state can contain secrets and should remain in the authorized local workflow.

`validation.md` identifies the exact checks run, their outputs, scope and failures. Separate JSON/static checks, provider-backed validation, plan review and post-deployment verification. Unrun checks are pending, not passes. Record provider versions and current official reference links used to verify the resource schema.

`deployment-checklist.md` records subscription, identity, approval boundary, dependencies, connectivity, state/backend requirements, expected resource additions/changes, cost assumptions, verification steps and rollback/recovery considerations. Availability of generated infrastructure code does not authorize deployment. Include service-specific cautions such as private access prerequisites or required outbound connectivity when they affect whether the service can function.

`operations.md` records ownership, monitoring, diagnostics, backup/restore expectations, patching/upgrade practices, scale limits and how to verify the service's success criteria. Use known workload requirements; mark unresolved business objectives explicitly.
