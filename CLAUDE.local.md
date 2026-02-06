# Local notes

## Git push

Use `GH_TOKEN` from `.env` for GitHub operations:

```
export GH_TOKEN=$(grep GH_TOKEN .env | cut -d= -f2)
git push
```
