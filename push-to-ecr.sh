#!/usr/bin/env bash
[ "$#" -eq 1 ] || exit "1 argument required, $# provided"

ACCOUNT="060413241596"
REGION="us-east-1"
REPOSITORY="sdz-agent"

ENVS=("dev" "hml" "snd" "prd")

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
for ENV in ${ENVS[@]}; do
    NODE_ENV=production docker build . -t $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPOSITORY:$ENV-$1
    docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPOSITORY:$ENV-$1
done