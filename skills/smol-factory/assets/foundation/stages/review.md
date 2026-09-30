# Review code

Read architecture, conventions, contribution policy and any domain references
assigned to this stage. Review the frozen PR diff against trusted base source,
relevant callers and tests. Follow changed behavior through its boundaries.

Assess correctness, ownership, dependency direction, consistency and regression
risk. Cite exact paths/revisions and explain concrete triggers and consequences.
Separate confirmed defects from questions or speculative concerns. Existing CI
results are evidence, not checks you ran.

Read code and tests; do not install dependencies, build, run tests, execute
contributor scripts or repair code here. Specify relevant verification scenarios
for the next stage. Request information or recommend feedback where needed.
Use `blocked` for a concrete defect awaiting contributor changes, and explain the
requested correction. Reserve `rejected` for an accepted rule excluding the
contribution; feedback does not require rejecting it.
Record local review findings; posting a GitHub review is a separate public action.
