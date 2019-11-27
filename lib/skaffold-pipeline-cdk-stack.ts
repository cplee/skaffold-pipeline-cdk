import cdk = require('@aws-cdk/core');
import ecr = require('@aws-cdk/aws-ecr');
import codecommit = require('@aws-cdk/aws-codecommit');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import { LocalCacheMode } from '@aws-cdk/aws-codebuild';
import { PolicyStatement, Policy } from '@aws-cdk/aws-iam';

export class SkaffoldPipelineCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repo = new codecommit.Repository(this, 'SourceRepo', {
      repositoryName: id,
    });

    const registry = new ecr.Repository(this, 'ImageRepo', {
      repositoryName: id
    });

    const skaffoldBuild = new codebuild.PipelineProject(this, 'SkaffoldBuild', {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: {
          variables: {
            SKAFFOLD_DEFAULT_REPO: `${this.account}.dkr.ecr.${this.region}.amazonaws.com`
          }
        },
        phases: {
          install: {
            "runtime-versions": {
              docker: 18
            },
            commands: [
              "curl -Lo /usr/bin/skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64",
              "chmod +x /usr/bin/skaffold",
              "curl -L https://git.io/get_helm.sh | bash",
            ],
          },
          pre_build: {
            commands: `$(aws ecr get-login --no-include-email --region ${this.region})`
          },
          build: {
            commands: [
              'skaffold build --file-output=image.json',
            ],
          },
        },
        artifacts: {
          files: [
            'skaffold.yaml',
            'image.json',
            'charts/**/*',
          ],
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        computeType:  codebuild.ComputeType.LARGE,
        privileged: true,
      },
      cache: codebuild.Cache.local(LocalCacheMode.DOCKER_LAYER),
    });
    skaffoldBuild.addToRolePolicy(new PolicyStatement({
      actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetAuthorizationToken",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
      ],
      resources: ['*'],
    }));


    const clusterName = 'lead'
    const tillerNamespace = 'reinvent19-staging'
    const istioDomain = `${tillerNamespace}.${clusterName}.prod.liatr.io`
    const skaffoldDeploy = new codebuild.PipelineProject(this, 'SkaffoldDeploy', {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: {
          variables: {
            TILLER_NAMESPACE: tillerNamespace,
            ISTIO_DOMAIN: istioDomain,
          },
        },
        phases: {
          install: {
            "runtime-versions": {
              python: 3.7
            },
            commands: [
              "curl -Lo /usr/bin/skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64",
              "chmod +x /usr/bin/skaffold",
              "curl -L https://git.io/get_helm.sh | bash",
            ],
          },
          pre_build: {
            commands: [
              `aws eks update-kubeconfig --name ${clusterName}`
            ],
          },
          build: {
            commands: [
              'skaffold deploy -a image.json -n ${TILLER_NAMESPACE}',
            ],
          },
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        computeType:  codebuild.ComputeType.LARGE,
      },
    });
    skaffoldDeploy.addToRolePolicy(new PolicyStatement({
      actions: [
          "eks:DescribeCluster",
      ],
      resources: ['*'],
    }));

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact('BuildOutput');
    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: id,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeCommitSourceAction({
              actionName: 'Source',
              repository: repo,
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'SkaffoldBuild',
              project: skaffoldBuild,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'SkaffoldDeploy',
              project: skaffoldDeploy,
              input: buildOutput,
            }),
          ],
        },
      ],
    });
  }
}
