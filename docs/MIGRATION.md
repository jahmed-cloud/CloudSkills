# Folder migration to CloudSkills

The package, MCP server identity, documentation and provider/core layout use CloudSkills. The current local checkout is still `C:/Users/jahmed/Desktop/Junaid/AzureSkills`. Windows rejected the physical folder rename because another process was using it. No files were moved or deleted by the failed rename.

The existing checkout remains runnable. Its modern executable is `src/server.js`; old `mcp/server/index.js` and module exports remain compatibility entry points. No folder-name change is needed to use the refactored tools now.

To finish the physical rename, close the project in editors and stop terminals/processes whose working directory is inside it. Open a separate PowerShell terminal outside the project and run:

```powershell
Set-Location -LiteralPath 'C:\Users\jahmed\Desktop\Junaid'
Rename-Item -LiteralPath 'C:\Users\jahmed\Desktop\Junaid\AzureSkills' -NewName 'CloudSkills'
```

Reopen `C:/Users/jahmed/Desktop/Junaid/CloudSkills` as the project folder. Renaming the directory preserves its Git metadata, reports, local policy database and installed dependencies. Update any absolute client executable or `POLICY_DATABASE` paths that still refer to AzureSkills. The supplied VS Code example uses `${workspaceFolder}` and follows whichever project folder is open.

Docker Compose deliberately retains its prior default project name `azureskills` to preserve existing named policy volumes after the folder rename. If you previously set a custom `COMPOSE_PROJECT_NAME`, retain it. Changing that name without moving the volume creates a separate policy store.

No AWS/GCP runtime implementation is added by this migration; those provider folders remain roadmap placeholders.
