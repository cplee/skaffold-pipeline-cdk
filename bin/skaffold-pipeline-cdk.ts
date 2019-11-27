#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { SkaffoldPipelineCdkStack } from '../lib/skaffold-pipeline-cdk-stack';

const app = new cdk.App();
const pipelineName = app.node.tryGetContext('name')
if(pipelineName === undefined) {
  throw new Error("Context 'name' is required!")
}
new SkaffoldPipelineCdkStack(app, pipelineName)
